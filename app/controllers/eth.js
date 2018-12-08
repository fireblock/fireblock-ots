// Copyright 2015-2017 Fireblock.
// This file is part of Fireblock.

// Fireblock is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Fireblock is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Fireblock.  If not, see <http://www.gnu.org/licenses/>.

const Web3 = require('web3')
const net = require('net')
const fs = require('fs')
const redis = require('redis')
const moment = require('moment')
const REDIS_PORT = process.env.REDIS_PORT || 6379

const libFcts = require('@fireblock.io/fireblocklibjs')
const OpenTimestamps = require('javascript-opentimestamps')

let config
if (process.env.NODE_ENV === 'testing') {
  config = require('../../config.test')
} else {
  config = require('../../config')
}
let contract = require('../../contract')

let conn = null
let tempDirname = `tmp`
let outputDirname = `blocks`
let errorDirname = 'errors'

function setup () {
  console.log('Create a Web3 connexion')
  conn = new Web3(config.ethereum.ipc, net)
  const stringStore = new conn.eth.Contract(contract.stringStoreABI, contract.stringStoreAddress)
  const store = new conn.eth.Contract(contract.storeABI, contract.storeAddress)
  const role = new conn.eth.Contract(contract.roleABI, contract.roleAddress)
  const operation = new conn.eth.Contract(contract.operationABI, contract.operationAddress)
  const fireblock = new conn.eth.Contract(contract.fireblockABI, contract.fireblockAddress)
  let client = redis.createClient(REDIS_PORT)
  libFcts.setConnectors(conn, stringStore, store, role, operation, fireblock, client)
  process.fireblock = {}
  process.fireblock.deltaGas = config.ethereum.deltaGas
}

async function createOTSFile () {
  let bkIndex = await libFcts.getBlockNumber()
  // create block file
  let block = await libFcts.getBlock(bkIndex-15)
  let txt = JSON.stringify(block)
  let blockNumber = block.number
  let fp = `${tempDirname}/block_${blockNumber}.txt`
  fs.writeFileSync(fp, txt)
  // create 
  let fps = `${tempDirname}/block_${blockNumber}.state`
  let now = moment().unix()
  let state = `STAMPED ${now}`
  fs.writeFileSync(fps, state)
  // compute sha 256
  let content = fs.readFileSync(fp, 'utf8')
  let sha256 = libFcts.rawSha256(content)
  // create OTS file
  let sha256b = OpenTimestamps.Utils.hexToBytes(sha256)
  const detached = OpenTimestamps.DetachedTimestampFile.fromHash(new OpenTimestamps.Ops.OpSHA256(), sha256b)
  try {
    await OpenTimestamps.stamp(detached)
    let ots = `${tempDirname}/block_${blockNumber}.txt.ots`
    let output = detached.serializeToBytes()
    fs.writeFileSync(ots, output, 'utf8')
  } catch(err) {
    console.error('Error', err)
  }
}

async function upgradeOTSFile () {
  fs.readdirSync(`${tempDirname}`).forEach(async (filename) => {
    if (filename.endsWith('state')) {
      let basename = `${filename}`.replace(/.state$/, '')
      // read state
      let fSTATE = `${tempDirname}/${filename}`
      let content = fs.readFileSync(fSTATE)
      let regexp = /STAMPED ([0-9]*)/g
      var match = regexp.exec(content)
      if ((match !== null) && (match[1] !== null)) {
        let dT = moment().unix() - parseInt(match[1])
        let fOTS = `${tempDirname}/${basename}.txt.ots`
        let content = fs.readFileSync(fOTS)
        const detached = OpenTimestamps.DetachedTimestampFile.deserialize(new OpenTimestamps.Context.StreamDeserialization(content))
        let changed = await OpenTimestamps.upgrade(detached)
        if (changed) {
          // upgrade OTS file
          let output = detached.serializeToBytes()
          fs.writeFileSync(fOTS, output, 'utf8')
          // upgrade state file
          let now = moment().unix()
          content = `UPGRADED ${now}`
          fs.writeFileSync(fSTATE, content, 'utf8')
          console.log(`upgradeOTSFile UPGRADED ${basename}`)
        } else {
          if (dT > (86400*2)) {
            // TIME ELAPSED -> ERROR
            // move
            fs.rename(`${tempDirname}/${basename}.txt`, `${errorDirname}/${basename}.txt`)
            fs.rename(`${tempDirname}/${basename}.txt.ots`, `${errorDirname}/${basename}.txt.ots`)
            // delete state file
            fs.unlinkSync(fSTATE)
            console.log(`upgradeOTSFile ERROR ${basename}`)
          } else {
            console.log(`upgradeOTSFile ${basename} WAITING ${dT}`)
          }
        }
      } else {
        console.debug(`nothing to upgrade`)
      }
    }
  })
}

async function verifyOTSFile () {
  fs.readdirSync(`${tempDirname}`).forEach(async (filename) => {
    try {
      if (filename.endsWith('state')) {
        let basename = `${filename}`.replace(/.state$/, '')
        // read state
        let fSTATE = `${tempDirname}/${filename}`
        let content = fs.readFileSync(fSTATE)
        let regexp = /UPGRADED ([0-9]*)/g
        var match = regexp.exec(content)
        if ((match !== null) && (match[1] !== null)) {
          let dT = moment().unix() - parseInt(match[1])
          let fOTS = `${tempDirname}/${basename}.txt.ots`
          let fTXT = `${tempDirname}/${basename}.txt`
          // detached
          let content = fs.readFileSync(fTXT, 'utf8')
          let sha256 = libFcts.rawSha256(content)
          let sha256b = OpenTimestamps.Utils.hexToBytes(sha256)
          const detached = OpenTimestamps.DetachedTimestampFile.fromHash(new OpenTimestamps.Ops.OpSHA256(), sha256b)
          // detached ots
          content = fs.readFileSync(fOTS)
          const detachedOts = OpenTimestamps.DetachedTimestampFile.deserialize(new OpenTimestamps.Context.StreamDeserialization(content))
          // verify
          let results = await OpenTimestamps.verify(detachedOts, detached)
          console.log('ELLIS', Object.keys(results).length, results)
          if(Object.keys(results).length > 0) {
            // we have enough confirmations
            // move
            await fs.rename(`${tempDirname}/${basename}.txt`, `${outputDirname}/${basename}.txt`)
            await fs.rename(`${tempDirname}/${basename}.txt.ots`, `${outputDirname}/${basename}.txt.ots`)
            // delete state file
            fs.unlinkSync(fSTATE)
            console.log(`OTS ${filename} verified`)
          } else {
            if (dT > (86400*2)) {
              // TIME ELAPSED -> ERROR
              // move
              fs.rename(`${tempDirname}/${basename}.txt`, `${errorDirname}/${basename}.txt`)
              fs.rename(`${tempDirname}/${basename}.txt.ots`, `${errorDirname}/${basename}.txt.ots`)
              // delete state file
              fs.unlinkSync(fSTATE)
              console.log(`upgradeOTSFile ERROR ${basename}`)
            }
          }
        } else {
          console.debug(`nothing to verify`)
        }
      }
    } catch (err) {
      console.log('ERROR', err)
    }
  })
}

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

module.exports = {
  createOTSFile,
  upgradeOTSFile,
  verifyOTSFile,
  sleep,
  setup
}

// read ots file
/*
let fp = `${tempDirname}/${filename}`
let content = fs.readFileSync(fp)
const detached = OpenTimestamps.DetachedTimestampFile.deserialize(new OpenTimestamps.Context.StreamDeserialization(content))
let changed = await OpenTimestamps.upgrade(detached)
if (changed) {
  let output = detached.serializeToBytes()
  fs.writeFileSync(fp, output, 'utf8')
}
console.log('ELLIS', changed)
*/