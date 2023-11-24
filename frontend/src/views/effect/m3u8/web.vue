<template>
  <div class="m3u8-web-wrapper">
    <h3>m3u8-web</h3>
    <div class="form">
      <a-input class="mb-10" v-model:value.trim="title" placeholder="标题" />
      <a-input class="mb-10" v-model:value.trim="url" placeholder="m3u8的地址" :disabled="downloading"/>
      <div class="mb-10">
        <a-button type="primary" :loading="downloading" @click="() => getM3U8(false)">原格式下载</a-button>
        <a-button type="primary" :loading="downloading" @click="getMP4">转码为MP4下载</a-button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { useScriptTag } from '@vueuse/core'
import { onMounted, ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { reqM3u8Url, downloadTsSegment } from '@/server/download-m3u8'

const title = ref('')
const url = ref('http://1257120875.vod2.myqcloud.com/0ef121cdvodtransgzp1257120875/3055695e5285890780828799271/v.f230.m3u8')
const downloading = ref(false)
const loadedScript = ref(false)
const isGetMP4 = ref(false) // 是否转码为 MP4 下载
const tsUrlList = ref([])
const durationWithMp4 = ref(0) // mp4的时长
const isPause = ref(false) // 是否暂停下载
const downloadIndex = ref(0) // 下载的下标

const { load: loadAES } = useScriptTag(
  'https://upyun.luckly-mjw.cn/lib/aes-decryptor.js',
  () => {
    // do something
  },
  { manual: true },
)

const { load: loadMux } = useScriptTag(
  'https://upyun.luckly-mjw.cn/lib/mux-mp4.js',
  () => {
    // do something
  },
  { manual: true },
)

const { load: loadSaver } = useScriptTag(
  'https://upyun.luckly-mjw.cn/lib/stream-saver.js',
  () => {
    // do something
  },
  { manual: true },
)

const failCountByDownload = computed(() => {
  const t = tsUrlList.filter(item => item.status === 'fail')
  return t.length
})

const successCountByDownload = computed(() => {
  const t = tsUrlList.filter(item => item.status === 'success')
  return t.length
})

const initScript = async () => {
  await loadAES()
  await loadMux()
  await loadSaver()
  loadedScript.value = true
}

const resetList = () => {
  tsUrlList.value = []
}

const getVideoTitle = () => {
  return new URL(url.value).searchParams.get('title') || title.value || Date.now().toString()
}

// 转mp4
const conversionMp4 = (buffer, index, cb) => {
  if (isGetMP4.value) {
    const transmuxer = new muxjs.Transmuxer({
      keepOriginalTimestamps: true,
      duration: Number.parseInt(downloadIndex.value)
    })
    transmuxer.on('data', (segment) => {
      // if (index === this.rangeDownload.startSegment - 1) {
      //   const data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength)
      //   data.set(segment.initSegment, 0)
      //   data.set(segment.data, segment.initSegment.byteLength)
      //   cb(data.buffer)
      // } else {
      //   cb(segment.data)
      // }
    })
    transmuxer.push(new Uint8Array(buffer))
    transmuxer.flush()
  } else {
    cb(buffer)
  }
}

// 处理ts
const dealTs = (buffer, index, cb) => {
  conversionMp4(buffer, index, (data) => {
    cb && cb()
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

  if (index >= len) {
    return
  }

  const target = tsUrlList.value[index]
  if (target && !target.status) {
    target.status = 'pending'
    const { url } = target
    downloadTsSegment(url).then((data) => {
      console.log(data)
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
    resetList()
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
            outTitle: getVideoTitle(),
            status: '',
            url: mergeUrl
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
  } finally {
    downloading.value = false
  }
}

const getMP4 = () => {
  isGetMP4.value = true
  getM3U8()
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
}
</style>