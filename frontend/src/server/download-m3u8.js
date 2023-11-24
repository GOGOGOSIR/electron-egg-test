import axios from 'axios'
export function reqM3u8Url(url) {
  return axios({
    url,
    method: 'GET',
  })
}

export function downloadTsSegment (url) {
  return axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer'
  })
}