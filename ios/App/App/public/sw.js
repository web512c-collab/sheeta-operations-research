/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "402b66900e731ca748771b6fc5e7a068"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "20b7fbb4374d877ff1db9d0123e6cd8d"
  }, {
    "url": "pwa-512x512.png",
    "revision": "6ab7e62e320d245239b919a0fb28caf5"
  }, {
    "url": "pwa-192x192.png",
    "revision": "83cdbbde54ba8e9037a90799b784847e"
  }, {
    "url": "index.html",
    "revision": "4dd8fc29ee1efc9c8cef9502a32a8b0b"
  }, {
    "url": "icon.svg",
    "revision": "3dc82091349d7435a71f8d7be907d6dc"
  }, {
    "url": "favicon.ico",
    "revision": "9e5543cdacad927da8fd3b49baa99849"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "134ec76cef8073bc51da5bae74de6c1f"
  }, {
    "url": "404.html",
    "revision": "4dd8fc29ee1efc9c8cef9502a32a8b0b"
  }, {
    "url": "assets/solverWorker-1KR6eBo3.js",
    "revision": null
  }, {
    "url": "assets/index-CCREOVgS.css",
    "revision": null
  }, {
    "url": "assets/index-C-qtRfUo.js",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "134ec76cef8073bc51da5bae74de6c1f"
  }, {
    "url": "favicon.ico",
    "revision": "9e5543cdacad927da8fd3b49baa99849"
  }, {
    "url": "icon.svg",
    "revision": "3dc82091349d7435a71f8d7be907d6dc"
  }, {
    "url": "pwa-192x192.png",
    "revision": "83cdbbde54ba8e9037a90799b784847e"
  }, {
    "url": "pwa-512x512.png",
    "revision": "6ab7e62e320d245239b919a0fb28caf5"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "20b7fbb4374d877ff1db9d0123e6cd8d"
  }, {
    "url": "manifest.webmanifest",
    "revision": "442a2a3b6c60f8d16970d9d0dc309a60"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
