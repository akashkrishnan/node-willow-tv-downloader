'use strict';

const cookie = require( 'cookie' );
const flattenArray = require( 'array-flatten/array-flatten' );

module.exports = {
  array,
  cookie,
  flattenArray,
  fn,
  uniqueArray,
  serializeCookies,
};

/**
 *
 * @param {*} [a]
 * @param {Object} [opts]
 * @param {boolean} [opts.recursive=false]
 * @param {(boolean|Function)} [opts.flatten=false]
 * @param {(boolean|Function)} [opts.unique=false]
 * @param {string} [opts.delimiter]
 * @returns {*[]}
 */
function array( a, opts = {} ) {

  if ( opts.unique ) {
    const unique = fn( opts.unique, uniqueArray );
    delete opts.unique;
    return unique( array( a, opts ) );
  }

  if ( opts.flatten ) {
    const flatten = fn( opts.flatten, flattenArray );
    delete opts.flatten;
    return flatten( array( a, opts ) );
  }

  if ( Array.isArray( a ) ) {
    return opts.recursive ? a.map( v => array( v, opts ) ) : a;
  }

  if ( typeof a === 'string' && opts.delimiter ) {
    return a.split( opts.delimiter );
  }

  if ( a === undefined ) {
    return [];
  }

  return [ a ];

}

function fn( fn, defaultFn ) {
  return fn && typeof fn === 'function' ? fn : defaultFn;
}

function serializeCookies( cookies ) {
  return Object.entries( cookies )
               .map( entry => cookie.serialize( ...entry ) )
               .join( '; ' );
}

function uniqueArray( a ) {
  return [ ...new Set( a ) ];
}
