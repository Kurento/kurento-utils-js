[![][KurentoImage]][website]

Copyright © 2014 Kurento. Licensed under [LGPL License].

Kurento Utils for Node.js and Browsers
======================================
[![Coverage Status](https://coveralls.io/repos/Kurento/kurento-utils-js/badge.svg)](https://coveralls.io/r/Kurento/kurento-utils-js)

The Kurento Utils project contains a set of reusable components that have been
found useful during the development of the WebRTC applications with Kurento.

The source code of this project can be cloned from the [GitHub repository].

Installation instructions
-------------------------

Be sure to have installed [Node.js] and [Bower] in your system:

```bash
curl -sL https://deb.nodesource.com/setup | sudo bash -
sudo apt-get install -y nodejs
sudo npm install -g bower
```

To install the library, it's recommended to do that from the [NPM repository] :

```bash
npm install kurento-utils
```

Alternatively, you can download the code using git and install manually its
dependencies:

```bash
git clone https://github.com/Kurento/kurento-utils-js
cd kurento-utils-js
npm install
```

Screen and window sharing depens on the privative module
```kurento-browser-extensions```. To enable its support, you'll need to install
the package dependency manually or proportionate a ```getScreenConstraints```
function yourself on runtime. If it's not available, when trying to share the
screen or a window content it will throw an exception.

### Browser

To build the browser version of the library you'll only need to exec the [grunt]
task runner and they will be generated on the ```dist``` folder. Alternatively,
if you don't have it globally installed, you can run a local copy by executing

```bash
node_modules/.bin/grunt
```


Acknowledges
------------

* [Bertrand CHEVRIER](https://github.com/krampstudio) for
  [grunt-jsdoc](https://github.com/krampstudio/grunt-jsdoc)


Kurento
=======

What is Kurento
---------------
Kurento provides an open platform for video processing and streaming based on
standards.

This platform has several APIs and components which provide solutions to the
requirements of multimedia content application developers. These include:

  * Kurento Media Server (KMS). A full featured media server providing
    the capability to create and manage dynamic multimedia pipelines.
  * Kurento Clients. Libraries to create applications with media
    capabilities. Kurento provides libraries for Java, browser JavaScript,
    and Node.js.

Downloads
---------
To download binary releases of Kurento components visit http://kurento.org

Code for other Kurento projects can be found in the [GitHub Kurento group].

News and Website
----------------
Information about Kurento can be found on our [website].
Follow us on Twitter @[kurentoms].

[GitHub Kurento group]: https://github.com/kurento
[GitHub repository]: https://github.com/kurento/kurento-utils
[grunt]: http://gruntjs.com/
[KurentoImage]: https://secure.gravatar.com/avatar/21a2a12c56b2a91c8918d5779f1778bf?s=120
[kurentoms]: http://twitter.com/kurentoms
[LGPL License]: http://www.gnu.org/licenses/lgpl-2.1.html
[Node.js]: http://nodejs.org/
[NPM repository]: https://www.npmjs.org/package/kurento-utils
[website]: http://kurento.org
