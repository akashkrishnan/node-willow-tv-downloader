'use strict';

const axios = require( 'axios' );

module.exports = {
  download: {
    toBuffer: downloadToBuffer,
    toFile: downloadToFile,
    toStream: downloadToStream,
  },
  pipeToFile,
  pipe,
};

async function downloadToBuffer( url, headers ) {

  const { data } = await axios.get(
    url.href,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36',
        ...headers,
      },
      responseType: 'arraybuffer',
    }
  );

  return data;

}

async function downloadToFile( url, filename ) {

  const data = await downloadToStream( url );

  return pipeToFile( data, filename );

}

async function downloadToStream( url, headers ) {

  const { data } = await axios.get(
    url.href,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36',
        ...headers,
      },
      responseType: 'stream',
    }
  );

  return data;

}

async function pipeToFile( read, filename ) {
  const write = fs.createWriteStream( filename );
  return pipe( read, write );
}

async function pipe( read, write ) {
  return new Promise( async ( resolve, reject ) => {

    write.on( 'error', reject )
         .on( 'finish', resolve );

    read.on( 'error', reject )
        .pipe( write );

  } );
}
