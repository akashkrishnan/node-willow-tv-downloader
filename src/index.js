'use strict';

const IOUtils = require( './utils/io' );
const fs = require( 'fs' );
const path = require( 'path' );
const m3u8 = require( '@chovy/m3u8' );
const parallel = require( 'parallel-transform' );
const streamstream = require( 'stream-stream' );
const ffmpeg = require( 'fluent-ffmpeg' );

module.exports = {
  downloadMaster,
  downloadIndex,
  parsePlaylist,
};

if ( require.main === module ) {
  main().catch( err => console.error( err.message ) );
}

async function main() {

  console.time( 'download' );

  const masterUrl = new URL(
    'https://akvod177w-vh.akamaihd.net/i/warchives/ICC_Cricket_World_Cup_2019__Sling_TV_+_TV_Viewers_/5661/Highlights/5661_Highlights_short_web.smil/master.m3u8?hdnts=exp=1558835859~acl=%2Fi%2Fwarchives%2FICC_Cricket_World_Cup_2019__Sling_TV_+_TV_Viewers_%2F5661%2FHighlights%2F5661_Highlights_short_web.smil*~hmac=f624685fe8ac58123f6f3c2aeb0316cff8543b90cfd17d9e35f06dbe5d217dab' );

  const outputDir = path.resolve( __dirname );
  const outputFilename = path.resolve( outputDir, path.basename( masterUrl.pathname ) );

  await downloadMaster( masterUrl, outputFilename );

  console.timeEnd( 'download' );

}

async function downloadMaster( masterUrl, outputFilename, numConnections = 8 ) {

  const parser = await parsePlaylist( masterUrl );

  const index = await reduceStream( parser, 'item', ( curr, item ) => {
    return !curr || item.get( 'bandwidth' ) > curr.get( 'bandwidth' ) ? item : curr;
  } );

  const indexUrl = new URL( index.get( 'uri' ) );

  return downloadIndex( indexUrl, outputFilename, numConnections );
}

async function downloadIndex( indexUrl, outputFilename, numConnections = 8 ) {
  return new Promise( async ( resolve, reject ) => {

    const output = fs.createWriteStream( outputFilename + '.mkv' )
                     .on( 'finish', resolve )
                     .on( 'error', reject );

    const merger = streamstream();

    ffmpeg().input( merger )
            .output( output )
            .videoCodec( 'copy' )
            .format( 'matroska' )
            .run();

    const downloader = parallel(
      numConnections,
      {},
      ( item, done ) => {

        const url = new URL( item.get( 'uri' ) );

        console.timeLog( 'download', path.basename( url.pathname ) );

        IOUtils.download.toStream( url ).then(
          stream => {

            // Continue after stream completely read
            stream.once( 'end', () => done() );

            // Merge stream
            merger.write( stream );

          },
          done
        );

      }
    );

    // Fired once all inputs have been processed to completion
    downloader.once( 'end', () => merger.end() );

    // Need to empty output stream for end event to fire
    downloader.on( 'data', () => 0 );

    const parser = await parsePlaylist( indexUrl );

    parser.on( 'item', item => downloader.write( item ) )
          .once( 'end', () => downloader.end() );

  } );
}

async function parsePlaylist( url ) {

  console.timeLog( 'download', path.basename( url.pathname ) );

  const parser = m3u8.createStream();
  const index = await IOUtils.download.toStream( url );

  index.pipe( parser );

  return parser;

}

async function reduceStream( stream, event, onreduce ) {
  return new Promise( ( resolve, reject ) => {

    let cur;

    stream.on( event, ( ...args ) => cur = onreduce( cur, ...args ) )
          .once( 'end', () => resolve( cur ) )
          .once( 'error', err => reject( err ) );

  } );
}
