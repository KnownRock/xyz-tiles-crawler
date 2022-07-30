const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { assert } = require('console');
const { argv } = require('process');

// initialize config
const config = argv[2] 
  ? require( path.resolve(process.cwd(),argv[2]) ) 
  : require('../config.json');

assert(config.savePath, 'config.savePath is required');
const urls = config.urls || (config.url ? [config.url] : []);
assert(urls.length, 'config.urls is required');

const ext = config.ext ?? urls[0].match(/\.(\w+)$/)?.[1] ?? 'noext';

const headers = config.headers ?? {};
const maxZoom = config.maxZoom ?? 18;
const minZoom = config.minZoom ?? 0;

const offset = config.offset ?? {
  x: 0,
  y: 0,
  z: 0
};

const withUnreachableList = config.withUnreachableList ?? true;

const unreachableListFileName = config.unreachableListFile ?? config.savePath + '.unreachableList.txt';
const unreachableListFile = path.resolve(process.cwd(), unreachableListFileName);
const unreachableListFileDir = path.dirname(unreachableListFile)
if (!fs.existsSync(unreachableListFileDir)) {
  fs.mkdirSync(unreachableListFileDir, { recursive: true });
}
if (!fs.existsSync(unreachableListFile)) {
  fs.writeFileSync(unreachableListFile, '');
}

const unreachableListDict = {};
const unreachableListText = fs.readFileSync(unreachableListFile, 'utf8');
const unreachableList = unreachableListText.split('\n').filter(Boolean);
unreachableList.forEach(indexsString => {
  unreachableListDict[indexsString] = true;
})


function saveUrlToFile(url, fileName) {
  const folderOfFile = path.dirname(fileName);

  const downloadFile = url => axios({ 
    url, 
    responseType: 'arraybuffer',
    headers
  }).then(res => res.data);

  return downloadFile(url)
    .then(data =>{ 
      if (!fs.existsSync(folderOfFile)) {
        fs.mkdirSync(folderOfFile, { recursive: true });
      }
      fs.writeFileSync(fileName, data);
    })
}

function getUrl(templateUrl, indexs){
  return templateUrl
    .replace(/\{z\}/g, indexs[0] + offset.z)
    .replace(/\{x\}/g, indexs[1] + offset.x)
    .replace(/\{y\}/g, indexs[2] + offset.y);
}

const downloadIndexsQueue = [[0,0,0]];

!(async () => {
  while(true) {
    const indexs = downloadIndexsQueue.shift();
    if (!indexs) {
      console.log('download finished!');
      break;
    }

    try {
      // download file when zoom over minZoom
      if (indexs[0] >= minZoom) {
        const fileName = path.resolve(
          process.cwd(),
          config.savePath, 
          `${indexs[0]}`, `${indexs[1]}`, `${indexs[2]}.${ext}`
        );

        if(!fs.existsSync(fileName) && (!withUnreachableList || !unreachableListDict[indexs.join('/')])) {
          console.log(`- downloading ${indexs[0]},${indexs[1]},${indexs[2]}`);
          
          await Promise.any(urls.map((templateUrl)=>{
            const url = getUrl(templateUrl, indexs);
            return saveUrlToFile(url, fileName)
          }))

          console.log('[ + ] downloaded')

        }else{
          console.log(`[e|u] ${indexs[0]},${indexs[1]},${indexs[2]}`);
        }
      }
    
      // if can reach , add children to queue
      if((!withUnreachableList || !unreachableListDict[indexs.join('/')])){
        // add next ZIndex tiles to queue
        const nextZIndex = indexs[0] + 1;
        const nextXIndex = indexs[1] * 2;
        const nextYIndex = indexs[2] * 2;
        if(nextZIndex <= maxZoom) {
          downloadIndexsQueue.push([nextZIndex, nextXIndex,     nextYIndex]);
          downloadIndexsQueue.push([nextZIndex, nextXIndex + 1, nextYIndex]);
          downloadIndexsQueue.push([nextZIndex, nextXIndex,     nextYIndex + 1]);
          downloadIndexsQueue.push([nextZIndex, nextXIndex + 1, nextYIndex + 1]);
        }
      }
    } catch (error) {
      console.log(`[ e ] downloading ${indexs[0]},${indexs[1]},${indexs[2]}`);
      // console.log(error.message);
      
      fs.appendFileSync(
        unreachableListFile,
        `${indexs[0]}/${indexs[1]}/${indexs[2]}\n`);
    }
  }
})();

