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

// =================================================================
// get the packages we need ========================================
// =================================================================
const ethFcts = require('./app/controllers/eth.js')
let schedule = require('node-schedule')

ethFcts.setup()

// every 6 hours: create a block and timestamps it
schedule.scheduleJob('0 0 */6 * * *', async function () {
  try {
    await ethFcts.createOTSFile()
  } catch (err) {
    console.error('error step 1', err)
  }
})

schedule.scheduleJob('0 5 */1 * * *', async function () {
  try {
    await ethFcts.upgradeOTSFile()
  } catch (err) {
    console.error('error step 2', err)
  }
})

schedule.scheduleJob('0 10 */1 * * *', async function () {
  try {
    await ethFcts.verifyOTSFile()
  } catch (err) {
    console.error('error step 3', err)
  }
})