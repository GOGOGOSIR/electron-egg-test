export const ajax = (options) => {
  return new Promise((rs, rj) => {
    options = options || {}
    const xhr = new XMLHttpRequest()
    if (options.type === 'file')
      xhr.responseType = 'arraybuffer'

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        const status = xhr.status
        if (status >= 200 && status < 300) {
          options.success && options.success(xhr.response)
          rs(xhr.response)
        } else {
          options.fail && options.fail(status)
          rj(status)
        }
      }
    }

    xhr.open('GET', options.url, true)
    xhr.send(null)
  })
}

export function debounce(func, delay) {
  let timeoutId;

  return function (...args) {
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}