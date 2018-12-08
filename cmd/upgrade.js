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
const ethFcts = require('../app/controllers/eth.js')

ethFcts.setup()

// every 6 hours: create a block and timestamps it
ethFcts.upgradeOTSFile().then(async () => {
  await ethFcts.sleep(15000)
  process.exit(0)
}).catch(err => {
  console.log('upgradeOTSFile error', err)
  process.exit(1)
})
