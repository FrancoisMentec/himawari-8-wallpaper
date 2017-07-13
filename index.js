const https = require('https')
const fs = require('fs')
const Stream = require('stream').Transform
const mergeImages = require('merge-images')
const Canvas = require('canvas')
const base64Img = require('base64-img')
const wallpaper = require('./wallpaper')

const IMAGE_SIZE = 550 // size of an image from himawari 8
const UPDATE_INTERVAL = 600000

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
 * @param {number} size - the size of the image (1, 2, 4, 8, 16), the real size of the image is: size * IMAGE_SIZE x size * IMAGE_SIZE
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
 * @param {function} callback - a function triggered once the image is loaded, take params:
 *   @param {Error|string} err - the error, can be null and b64
 *   @param {string} b64 - the image in b64: 'data:image/png;base64,iVBOR...'
 *   @param {string} reference - the image reference: 'year-month-date_hour:minutes_size'
 */
function getImage (year, month, date, hours, minutes, size, callback) {
  var reference = year + '-' + month + '-' + date + '_' + hours + ':' + minutes + '_' + size
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
        https.get(getUrl(year, month, date, hours, minutes, x, y, size), function (res) {
          var data = new Stream()
          res.on('data', function (d) {
            data.push(d)
          })
          res.on('end', function () {
            var image = {
              src: data.read(),
              x: x * IMAGE_SIZE,
              y: y * IMAGE_SIZE
            }
            buffer.push(image)
            //fs.writeFileSync('download/' + x + ',' + y + '.png', image.src)
            if (++imgLoaded === size * size) {
              mergeImages(buffer, options).then(function (b64) {
                callback(null, b64, reference)
              }).catch(function (err) {
                callback(err, null, reference)
              })
            }
          })
          res.on('error', function (err) {
            console.error(err)
          })
        })
      })(x, y)
    }
  }
}

/**
 * Get last image
 * @param check getImage()
 */
function getLastImage (size, callback) {
  var d = new Date()
  var time = d.getTime() - 1800000 // - half an hour (hamawari 8 lantency)
  time -= time % 600000 // Round to previous 10 minutes
  d.setTime(time)

  getImage(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), size, callback)
}

function updateWallpaper () {
  getLastImage(4, function (err, b64, reference) {
    if (err) console.error(err)
    else {
      base64Img.img(b64, __dirname + '/download', reference, function (err, filepath) {
        if (err) console.error(err)
        else {
          wallpaper.set(filepath).then(function () {
            console.log('wallpaper updated: ' + filepath)
            updateTimeout = setTimeout(function () {
              updateWallpaper()
            }, UPDATE_INTERVAL)
          }).catch(function (err) {
            console.error(err)
          })
        }
      })
    }
  })
}


updateWallpaper()
