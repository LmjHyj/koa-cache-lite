'use strict'

var Store = require('./lib/store')
var responseKeys = [ 'header', 'body' ]

module.exports = function(routes, opts) {
  if (opts.debug) console.info('cache options:', routes, opts.debug)

  opts.expireOpts = new Map()
  opts.defaultTimeout = 5000
  var store = new Store(opts)
      
  let routeKeys = Object.keys(routes)
  let routeKeysLength = routeKeys.length

  return function *(next) {
    try {
      // check if route is permitted to be cached
      if (!routeKeysLength) return yield next;

      for (let i = 0; i < routeKeysLength; i++) {
        let key = routeKeys[i]
        if (this.request.path.indexOf(key) != -1) {
          let routeExpire = routes[key]

          if (routeExpire == false) {
            return yield next
          }

          if (isNaN(routeExpire) && (typeof routeExpire !== 'boolean')) {
            if (opts.debug) console.warn('invalid cache setting:', routeExpire)
            return yield next
          }

          // override default timeout
          if (typeof routeExpire === 'boolean') routeExpire = opts.defaultTimeout
          else opts.expireOpts.set(this.request.path, routeExpire)
          break
        }

        if (i == routeKeys.length - 1) return yield next
        else continue
      }

      // check if no-cache is provided
      if (this.request.header['cache-control'] == 'no-cache') {
        return yield next
      }

      // check if HTTP methods other than GET are sent
      if (this.request.method != 'GET') {
        return yield next
      }

      let _url = this.request.url

      // return cached response
      let exists = yield store.has(_url)

      if (exists) {
        let item = yield store.get(_url)
        if ('string' == typeof(item)) item = JSON.parse(item)
        if (opts.debug) console.info('returning from cache for url', _url)

        for (let key in item) {
          if (key == 'header') {
            let value = item[key]

            for (let hkey in value) {
              this.set(hkey, value[hkey])
            }

            continue
          }

          this[key] = item[key]
        }

        return
      }

      // call next middleware and cache response on return
      yield next

      let _response = new Object()

      for (let key in this.response) {
        if (responseKeys.indexOf(key) != -1)
          _response[key] = this.response[key]
      }

      if (opts.debug) console.info('caching', _url)

      // set new caching entry
      store.set(_url, _response)
    }
    catch (error) {
      if (opts.debug) console.error(error)
      this.throw(error)
    }
  }
}
