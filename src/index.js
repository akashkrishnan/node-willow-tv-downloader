'use strict';

const Utils = require( './utils' );
const IOUtils = require( './utils/io' );
const fs = require( 'fs' );
const path = require( 'path' );
const axios = require( 'axios' );
const m3u8 = require( '@chovy/m3u8' );
const parallel = require( 'parallel-transform' );
const streamstream = require( 'stream-stream' );
const ffmpeg = require( 'fluent-ffmpeg' );
const htmlparser2 = require( 'htmlparser2' );

module.exports = {
  downloadMaster,
  downloadIndex,
  parsePlaylist,
  extractMasterUrl,
};

if ( require.main === module ) {
  main().catch( err => console.error( err.message ) );
}

async function main() {

  const matchid = 5482;
  const outputDir = path.resolve( __dirname );
  const session = process.env.WILLOW_TV_SESSION;

  console.time( 'download' );

  await downloadMatch( matchid, outputDir, session );

  console.timeEnd( 'download' );

}

async function downloadMatch( matchid, outputDir, session ) {

  const replayUrls = await getReplayUrls( matchid, session );

  for ( const replay of replayUrls ) {

    const outputFilename = path.resolve(
      outputDir,
      replay.title + ( replayUrls.length > 1 ? ` - Part ${replay.priority}` : '' )
    );

    await downloadMaster( replay.url, outputFilename );

  }

}

async function downloadMaster( masterUrl, outputFilename, numConnections = 8 ) {

  const parser = await parsePlaylist( masterUrl );

  const index = await __reduceStream( parser, 'item', ( curr, item ) => {
    return !curr || item.get( 'bandwidth' ) < curr.get( 'bandwidth' ) ? item : curr;
  } );

  const indexUrl = new URL( index.get( 'uri' ) );

  return downloadIndex( indexUrl, outputFilename, numConnections );
}

async function downloadIndex( indexUrl, outputFilename, numConnections = 8 ) {
  return new Promise( async ( resolve, reject ) => {

    const output = fs.createWriteStream( outputFilename + '.ts' )
                     .on( 'finish', resolve )
                     .on( 'error', reject );

    const merger = streamstream();

    merger.pipe( output );

    // ffmpeg().input( merger )
    //         .output( output )
    //         .videoCodec( 'copy' )
    //         .format( 'matroska' )
    //         .run();

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

async function __reduceStream( stream, event, onreduce ) {
  return new Promise( ( resolve, reject ) => {

    let cur;

    stream.on( event, ( ...args ) => cur = onreduce( cur, ...args ) )
          .once( 'end', () => resolve( cur ) )
          .once( 'error', err => reject( err ) );

  } );
}

async function getReplayUrls( matchid, session ) {

  const cookie = Utils.serializeCookies( { session } );

  const { data } = await axios.get(
    'https://www.willow.tv/match_replay_data_by_id',
    {
      headers: { cookie },
      params: { matchid },
    }
  );

  const result = JSON.parse( /HandleMatchReplayDetails\((.*)\)/g.exec( data )[ 1 ] );

  if ( result.status !== 'success' ) {
    throw Error( 'Unable to get match replay data.' );
  }

  return result.result.replay[ 0 ].map( ( { title, priority, secureurl } ) => ( {
    title,
    priority,
    url: new URL( secureurl ),
  } ) );

}

async function extractMasterUrl( url ) {

  const html = await IOUtils.download.toStream(
    url,
    {}
  );

  return new Promise( ( resolve, reject ) => {

    let script;
    let url;

    const parser = new htmlparser2.Parser(
      {
        onopentagname: name => script = name === 'script',
        ontext: text => {
          if ( script && !url ) {

            const re = /f_strm = "(.*)";/g;

            const results = re.exec( text );

            if ( results && results[ 1 ] ) {
              url = new URL( results[ 1 ] );
            }

          }
        },
        onerror: reject,
        onend: () => resolve( url ),
      }
    );

    html.pipe( parser );

  } );

}
