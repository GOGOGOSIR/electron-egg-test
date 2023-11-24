/**
 * axios的拦截处理
 */

import axios from 'axios'

let requestInterceptor = null
let responseInterceptor = null

// 添加header配置
axios.defaults.timeout = 60000

// 初始化axios的拦截器
function initInterceptors() {
  if (requestInterceptor !== null || responseInterceptor !== null) {
    // 清除之前的拦截器
    if (typeof requestInterceptor === 'number')
      axios.interceptors.request.eject(requestInterceptor)

    if (typeof responseInterceptor === 'number')
      axios.interceptors.response.eject(responseInterceptor)

    requestInterceptor = null
    responseInterceptor = null
  }

  requestInterceptor = axios.interceptors.request.use(
    async (config) => {

      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  responseInterceptor = axios.interceptors.response.use(
    (res) => {
      return res.data
    },
    (error) => {
      return Promise.reject(error)
    }
  )
}

initInterceptors()

export { default } from 'axios'
