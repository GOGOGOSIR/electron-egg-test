<template>
  <div class="m3u8-web-wrapper">
    <h3>m3u8-web</h3>
    <div class="form">
      <a-input class="mb-10" v-model:value.trim="title" placeholder="标题" />
      <a-input class="mb-10" v-model:value.trim="url" placeholder="m3u8的地址" :disabled="downloading"/>
      <div class="mb-10 stream">
        <span>启用特大文件下载</span>
        <a-radio-group v-model:value="streamDownload" @change="handleChange">
          <a-radio :value="0">否</a-radio>
          <a-radio :value="1">是</a-radio>
        </a-radio-group>
      </div>
      <div class="mb-10">
        <a-button class="mr-10" type="primary" :loading="downloading" @click="() => getM3U8(false)">原格式下载</a-button>
        <a-button class="mr-10" type="primary" :loading="downloading" @click="getMP4">转码为MP4下载</a-button>
        <a-button class="mr-10" type="primary" :disabled="pauseDisabled" @click="handlePause">{{ pauseText }}</a-button>
      </div>
      <div class="process-wrapper">
        <h4>碎片总数量： {{ tsUrlList.length }} &nbsp; &nbsp; 待下载： {{ tsUrlList.length - failCountByDownload - successCountByDownload }}  &nbsp; &nbsp; 下载完毕：{{ successCountByDownload }} &nbsp; &nbsp; 下载失败：{{ failCountByDownload }}</h4>

        <ul class="process-list">
          <li :class="{'process-item': true, 'process-item__success': item.status === 'success', 'process-item__fail': item.status === 'fail'}" v-for="(item, index) in tsUrlList" :key="index">
            <span>{{index + 1}}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
<script setup>
import { useScriptTag } from '@vueuse/core'
import { onMounted, ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { reqM3u8Url, downloadTsSegment } from '@/server/download-m3u8'
import dayjs from 'dayjs'
import muxjs from 'mux.js'

const title = ref('')
const url = ref('http://1257120875.vod2.myqcloud.com/0ef121cdvodtransgzp1257120875/3055695e5285890780828799271/v.f230.m3u8')
const downloading = ref(false)
const loadedScript = ref(false)
const isGetMP4 = ref(false) // 是否转码为 MP4 下载
const tsUrlList = ref([])
const durationWithMp4 = ref(0) // mp4的时长
const isPause = ref(false) // 是否暂停下载
const downloadIndex = ref(0) // 下载的下标
const streamWriter = ref(null)
const streamDownload = ref(0) // 是否启用流式下载

// 用于存储合并后的数据
let mergedData = new Uint8Array(0);

// const { load: loadAES } = useScriptTag(
//   'https://upyun.luckly-mjw.cn/lib/aes-decryptor.js',
//   () => {
//     // do something
//   },
//   { manual: true },
// )

// const { load: loadMux } = useScriptTag(
//   'https://upyun.luckly-mjw.cn/lib/mux-mp4.js',
//   () => {
//     // do something
//   },
//   { manual: true },
// )

const { load: loadSaver } = useScriptTag(
  'https://upyun.luckly-mjw.cn/lib/stream-saver.js',
  () => {
    // do something
  },
  { manual: true },
)

const failCountByDownload = computed(() => {
  const t = tsUrlList.value.filter(item => item.status === 'fail')
  return t.length
})

const successCountByDownload = computed(() => {
  const t = tsUrlList.value.filter(item => item.status === 'success')
  return t.length
})

const pauseDisabled = computed(() => {
  if (isPause.value) {
    return false
  } else {
    return !(downloading.value && downloadIndex.value <= tsUrlList.value.length)
  }
})

const pauseText = computed(() => {
  return isPause.value ? '恢复下载' : '暂停下载'
})

const downloadByStream = computed(() => {
  return streamWriter.value && streamDownload.value === 1
})

const initScript = async () => {
  // await loadAES()
  // await loadMux()
  await loadSaver()
  loadedScript.value = true
}

const resetData = () => {
  tsUrlList.value = []
  downloadIndex.value = 0
  durationWithMp4.value = 0
  isPause.value = false
}

const getVideoTitle = () => {
  return title.value || new URL(url.value).searchParams.get('title') || dayjs().format('YYYY_MM_DD_HH_mm_ss')
}

const downloadFile = (fileName) => {
  const a = document.createElement('a')
  const fileDataList = tsUrlList.value.map(item => item.mediaFile)
  let fileBlob = null
  if (isGetMP4.value) {
    fileBlob = new Blob(fileDataList, { type: 'video/mp4' }) // 创建一个Blob对象，并设置文件的 MIME 类型
    a.download = `${fileName}.mp4`
  } else {
    fileBlob = new Blob(fileDataList, { type: 'video/MP2T' }) // 创建一个Blob对象，并设置文件的 MIME 类型
    a.download = `${fileName}.ts`
  }
  const url = URL.createObjectURL(fileBlob)
  a.href = url
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  downloading.value = false
}

// 转mp4
const conversionMp4 = (buffer) => {
  var remuxedSegments = [];
  var remuxedBytesLength = 0;
  var remuxedInitSegment = null;
  return new Promise((resolve, reject) => {
    /**
     * {
      keepOriginalTimestamps: true,
      duration: Number.parseInt(downloadIndex.value)
    }
     */
    // 2.remux选项默认为true，将源数据的音频视频混合为mp4，设为false则不混合
    const transmuxer = new muxjs.mp4.Transmuxer({keepOriginalTimestamps: true})
    transmuxer.on('data', (segment) => {
      console.log(segment, '转换后的', segment.initSegment.byteLength, segment.data.byteLength)
      if (downloadIndex.value === 0) {
        const data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength)
        data.set(segment.initSegment, 0)
        data.set(segment.data, segment.initSegment.byteLength)
        console.log(muxjs.mp4.tools.inspect(data))
        resolve(data.buffer)
      } else {
        console.log(muxjs.mp4.tools.inspect(segment.data))
        resolve(segment.data)
      }
    })
    // transmuxer.on('data', (segment) => {
    //   // remuxedSegments.push(event);
    //   // remuxedBytesLength += event.data.byteLength;
    //   // remuxedInitSegment = event.initSegment;
    //   // 将 segment.initSegment 和 segment.data 合并到一个 Uint8Array 中。这样可以保证数据的完整性，并使其符合 MP4 文件的格式。
    //   const mergedSegment = new Uint8Array(mergedData.length + segment.initSegment.byteLength + segment.data.byteLength);
    //   mergedSegment.set(mergedData, 0);
    //   mergedSegment.set(segment.initSegment, mergedData.length);
    //   mergedSegment.set(segment.data, mergedData.length + segment.initSegment.byteLength);

    //   // 处理转封装后的数据
    //   console.log('Remuxed segment:', mergedSegment);

    //   // 更新 mergedData 以备下一次使用
    //   mergedData = mergedSegment;

    //   resolve(mergedSegment)
    // })
    // //  监听转换完成事件，拼接最后结果并传入MediaSource
    // transmuxer.on('done', function () {
    //   var offset = 0;
    //   var bytes = new Uint8Array(remuxedInitSegment.byteLength + remuxedBytesLength)
    //   bytes.set(remuxedInitSegment, offset);
    //   offset += remuxedInitSegment.byteLength;

    //   for (var j = 0, i = offset; j < remuxedSegments.length; j++) {
    //     bytes.set(remuxedSegments[j].data, i);
    //     i += remuxedSegments[j].byteLength;
    //   }
    //   remuxedSegments = [];
    //   remuxedBytesLength = 0;
    //   // 解析出转换后的mp4相关信息，与最终转换结果无关
    //   const vjsParsed = muxjs.mp4.tools.inspect(bytes);
    //   console.log('transmuxed', bytes, vjsParsed);
    //   resolve(bytes)
    // });

    transmuxer.on('error', (err) => {
      reject(err)
    })
    transmuxer.push(new Uint8Array(buffer))
    transmuxer.flush()
  })
}


// 下载ts
const downloadTs = () => {
  const len = tsUrlList.value.length
  const index = downloadIndex.value
  const pause = isPause.value

  // 异常自动重新下载，下载下一个片段
  const downloadFn = () => {
    if (index < len && !pause) {
      downloadTs()
    }
  }

  if (index >= len || pause) {
    return
  }

  const target = tsUrlList.value[index]
  if (target && !target.status) {
    target.status = 'pending'
    const { url } = target
    downloadTsSegment(url).then(async (buffer) => {
      let dealBuffer = buffer
      if (isGetMP4.value) {
        // 转换mp4
        //
        dealBuffer = await conversionMp4(buffer)

      }
      console.log(dealBuffer, '=dealBuffer=')
      target.mediaFile = dealBuffer
      target.status = 'success'

      if (downloadByStream.value) {
        // 流下载器-针对大文件下载
      } else {
        // 所有ts片段都下载完毕后执行下载文件
        if (index === len - 1) {
          const fileName = getVideoTitle()
          downloadFile(fileName)
        }
      }
     // 下载下一个
     downloadIndex.value++
     downloadFn()
    }, () => {
      target.status = 'fail'
      // 异常自动重新下载
      downloadFn()
    })
  }
}

// 合成url
const mergeURL = (targetURL, baseURL) => {
  baseURL = baseURL || location.href
  if (targetURL.indexOf('http') === 0) {
    // 当前页面使用 https 协议时，强制使 ts 资源也使用 https 协议获取
    if (location.href.indexOf('https') === 0)
      return targetURL.replace('http://', 'https://')

    return targetURL
  } else if (targetURL[0] === '/') {
    const domain = baseURL.split('/')
    return `${domain[0]}//${domain[2]}${targetURL}`
  } else {
    const domain = baseURL.split('/')
    domain.pop()
    return `${domain.join('/')}/${targetURL}`
  }
}

const getM3U8 = async () => {
  if (!loadedScript.value) {
    message.warning('请稍等脚本加载完成')
    return
  }
  if (!url.value) {
    message.warning('请输入链接')
    return
  }
  if (!url.value.toLowerCase().includes('m3u8')) {
    message.warning('链接有误，请重新输入')
    return
  }

  if (downloading.value) {
    message.warning('资源下载中，请稍后')
    return
  }

  try {
    // TODO: 校验协议不一致的情况
    resetData()
    downloading.value = true

    const m3u8Str = await reqM3u8Url(url.value)
    // console.log(m3u8Str, '=m3u8Str=')
    if (m3u8Str) {
      const m3u8StrList = m3u8Str.split('\n')
      // 提取 ts 视频片段地址
      for (const str of m3u8StrList) {
        // 放开片段后缀限制，下载非 # 开头的链接片段
        if (/^[^#]/.test(str)) {
          const mergeUrl = mergeURL(str, url.value)
          tsUrlList.value.push({
            title: str,
            status: '',
            url: mergeUrl,
            mediaFile: null
          })
        }
        // 获取需要下载的 MP4 视频长度
        if (isGetMP4.value) {
          if (str.toUpperCase().includes('#EXTINF:')) {
            durationWithMp4.value += Number.parseFloat(str.split('#EXTINF:')[1])
          }
        }
      }

      downloadTs()
    } else {
      message.warning('m3u8Str is null')
    }
  } catch (err) {
    console.warn(err)
    message.warning(err.message)
  }
}

const getMP4 = () => {
  isGetMP4.value = true
  getM3U8()
}

const handlePause = () => {
  const pause = isPause.value
  isPause.value = !pause
  if (pause) {
    // 恢复下载
    downloading.value = true
    downloadTs()
  } else {
    downloading.value = false
  }
}

const createStreamDownload = () => {
  console.log('创建流实例')
  const fileName = getVideoTitle()
  streamWriter.value = window.streamSaver.createWriteStream(`${fileName}.${isGetMP4.value ? 'mp4' : 'ts'}`).getWriter()
}

const handleChange = () => {
  if (streamDownload.value === 1 && !streamWriter.value) {
    createStreamDownload()
  }
}

onMounted(() => {
  initScript()
})
</script>
<style lang="less" scoped>
.m3u8-web-wrapper {
 h3 {
  color: rgb(173, 119, 54);
 }

 .form {
  padding: 15px;
 }

 .mb-10 {
  margin-bottom: 10px;
 }
 .mr-10 {
  margin-right: 10px;
 }
 .process-list {

  .process-item {
    display: inline-flex;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    margin-right: 10px;
    margin-bottom: 10px;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    background: #ccc;
    color: #999;
    &.process-item__success {
      background: rgb(48, 181, 106);
      color: #fff;
    }
    &.process-item__fail{
      background: rgb(241, 61, 11);
      color: #fff;
    }
  }
 }
}
</style>