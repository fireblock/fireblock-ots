# OpenTimeStamps

3 steps:
 1. export a block & create OTS file
 2. few hours later, add blockchain info
 3. verify

Step 1:
 * get last block index: i
 * export j (with j=i-15) block & save it in block_j.txt
 * create block_j.state with `STAMPED ${timestamp}` content
 * create a stamp

Step 2:
 * list all block_j.state
 * foreach with STAMPED content do upgrade OTS
   if upgrade succeeded change state to `UPGRADED ${timestamp}`
   if failure check if period > 48h then change state to ERROR & move to error directory

Step 3:
 * list all block_j.state
 * foreach with UPGRADED content do verify OTS
   if verify succeeded change state to VERIFIED & move to output directory
   if failure check if period > 48h then change state to ERROR & move to error directory
