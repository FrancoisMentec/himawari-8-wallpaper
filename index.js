const https = require('https')
const fs = require('fs')
const Stream = require('stream').Transform
const mergeImages = require('merge-images')
const Canvas = require('canvas')
const base64Img = require('base64-img')
const wallpaper = require('./wallpaper')

const IMAGE_SIZE = 550 // size of an image from himawari 8
const NO_IMAGE_DATE = new Date('Mon, 06 Jul 2015 15:00:00 GMT')

// config
/**
 * Size of the wallpaper
 * 1: 550x550
 * 2: 1100x1100
 * 4: 2200x2200
 * 8: 4400x4400
 * 16: 8800x8800
 */
const SIZE = 4

/**
 * Keep older image, if false doesn't remove previously downloaded image
 */
const KEEP_OLDER = false


var updateTimeout = null

/**
 * Return the url for the image that match parameters:
 * @param {number} year - the year
 * @param {number} month - the month
 * @param {number} date - the date
 * @param {number} hours - the hour
 * @param {number} minutes - the minute (0, 10, 20, 30, 40, 50)
 * @param {number} x - the x position, start at 0 end at size - 1
 * @param {number} y - the y position, start at 0 end at size - 1
 * @param {number} size - the size of the image (1, 2, 4, 8, 16)
 * @return {string} The url of the image
 */
function getUrl (year, month, date, hours, minutes, x, y, size) {
  month = month < 10
    ? '0' + month
    : month
  date = date < 10
    ? '0' + date
    : date
  hours = hours < 10
    ? '0' + hours
    : hours
  minutes = minutes < 10
    ? '0' + minutes
    : minutes
  return 'https://himawari8-dl.nict.go.jp/himawari8/img/D531106/' + size + 'd/550/' + year + '/' + month + '/' + date + '/' + hours + minutes + '00_' + x + '_' + y + '.png'
}

/**
 * Get the full image for specified parameters
 * @param check getUrl() params
 * @return {Promise}
 */
function getImage (year, month, date, hours, minutes, size) {
  return new Promise((resolve, reject) => {
    var reference = year + '-' + month + '-' + date + '_' + hours + '-' + minutes + '_' + size
    var buffer = []
    var options = {
      width: IMAGE_SIZE * size,
      height: IMAGE_SIZE * size,
      Canvas: Canvas
    }
    var imgLoaded = 0
    for (var x = 0; x < size; x++) {
      for (var y = 0; y < size; y++) {
        (function (x, y) {
          var url = getUrl(year, month, date, hours, minutes, x, y, size)
          //console.log(url)
          https.get(url, function (res) {
            var data = new Stream()

            if (res.statusCode >= 300) {
              console.error(url + ' returned status code: ' + res.statusCode)
            } else {
              res.on('data', function (d) {
                data.push(d)
              })

              res.on('end', function () {
                var image = {
                  src: data.read(),
                  x: x * IMAGE_SIZE,
                  y: y * IMAGE_SIZE
                }
                if ((new Date(res.headers['last-modified'])).getTime() === NO_IMAGE_DATE.getTime()) {
                  reject(new Error('No image.'))
                }
                buffer.push(image)
                //fs.writeFileSync('download/' + x + ',' + y + '.png', image.src)
                if (++imgLoaded === size * size) {
                  mergeImages(buffer, options).then(function (b64) {
                    resolve(b64, reference)
                  }).catch(function (err) {
                    reject(err)
                  })
                }
              })

              res.on('error', function (err) {
                console.error(err)
              })
            }
          })
        })(x, y)
      }
    }
  })
}

/**
 * Get last image
 * @param check getImage()
 */
function getLastImage (size) {
  return new Promise((resolve, reject) => {
    var d = new Date()
    var time = d.getTime() - 1800000 // - half an hour (hamawari 8 lantency)
    time -= time % 600000 // Round to previous 10 minutes
    d.setTime(time)

    getImage(d.getUTCFullYear(), d.getUTCMonth() + 1/* bc date month start at 0 */, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), size).then(resolve).catch(reject)
  })
}

function updateWallpaper () {
  getLastImage(SIZE).then((b64, reference) => {
    //console.log(b64)
    var name = KEEP_OLDER
      ? reference
      : 'last'
    base64Img.img(b64, __dirname + '/download', name, function (err, filepath) {
      if (err) console.error(err)
      else {
        wallpaper.set(filepath).then(function () {
          var now = new Date()
          var hours = now.getHours() < 10
            ? '0' + now.getHours()
            : now.getHours()
          var minutes = now.getMinutes() < 10
            ? '0' + now.getMinutes()
            : now.getMinutes()
          var seconds = now.getSeconds() < 10
            ? '0' + now.getSeconds()
            : now.getSeconds()
          console.log(hours + ':' + minutes + ':' + seconds + ' - wallpaper updated: ' + reference)
          var up = 600000 - ((now.getTime() + 600000) % 600000) + 30000 // 30 sec margin in case server is late
          //console.log(up)
          updateTimeout = setTimeout(function () {
            updateWallpaper()
          }, up)
        }).catch(function (err) {
          console.error(err)
          updateTimeout = setTimeout(function () {
            updateWallpaper()
          }, 60000)
        })
      }
    })
  }).catch(err => {
    console.error(err)
    updateTimeout = setTimeout(function () {
      updateWallpaper()
    }, 60000)
  })
}


updateWallpaper()
