# Kurento Utils for Node.js and Browsers

[![License badge](https://img.shields.io/badge/license-Apache2-orange.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Documentation badge](https://readthedocs.org/projects/fiware-orion/badge/?version=latest)](https://doc-kurento.readthedocs.io)
[![Docker badge](https://img.shields.io/docker/pulls/fiware/orion.svg)](https://hub.docker.com/r/fiware/stream-oriented-kurento/)
[![Support badge]( https://img.shields.io/badge/support-sof-yellowgreen.svg)](https://stackoverflow.com/questions/tagged/kurento)
[![Coverage Status](https://coveralls.io/repos/Kurento/kurento-utils-js/badge.svg)](https://coveralls.io/r/Kurento/kurento-utils-js)

[![Kurento][KurentoImage]][Kurento]

Copyright 2014-2021 [Kurento]. Licensed under [Apache 2.0 License].

[Kurento]: https://kurento.org
[KurentoImage]: https://secure.gravatar.com/avatar/21a2a12c56b2a91c8918d5779f1778bf?s=120
[Apache 2.0 License]: http://www.apache.org/licenses/LICENSE-2.0

The Kurento Utils project contains a set of reusable components that have been
found useful during the development of the WebRTC applications with Kurento.

> :warning: **Warning**
>
> This library is not actively maintained. It was written to simplify the
> [Kurento Tutorials](https://doc-kurento.readthedocs.io/en/latest/user/tutorials.html)
> and has several shortcomings for more advanced uses.
>
> For real-world applications we recommend to **avoid using this library** and
> instead to write your JavaScript code directly against the browser’s WebRTC API.

## Installation instructions

Be sure to have installed [Node.js](https://nodejs.org/) in your system:

```sh
curl -sL https://deb.nodesource.com/setup | sudo -E bash -
sudo apt-get install -y nodejs
```

To install the library, it's recommended to do that from the
[NPM repository](https://www.npmjs.com/):

```sh
npm install kurento-utils
```

Alternatively, you can download the code using git and install manually its
dependencies:

```sh
git clone https://github.com/Kurento/kurento-utils
cd kurento-utils
npm install
```

### Browser

You can use the browser version by adding the next `script` tag:

```html
<script src="https:/unpkg.com/kurento-utils/kurento-utils.js"></script>
```

## Acknowledges

* [Bertrand CHEVRIER](https://github.com/krampstudio) for
  [grunt-jsdoc](https://github.com/krampstudio/grunt-jsdoc) (not used anymore)
* [CPI Technologies GmbH](https://cpitech.io/) for sponsoring

## About Kurento

Kurento is an open source software project providing a platform suitable for
creating modular applications with advanced real-time communication
capabilities. For knowing more about Kurento, please visit the Kurento project
website: https://www.kurento.org.

Kurento is part of [FIWARE]. For further information on the relationship of
FIWARE and Kurento check the [Kurento FIWARE Catalog Entry]. Kurento is also
part of the [NUBOMEDIA] research initiative.

[FIWARE]: http://www.fiware.org
[Kurento FIWARE Catalog Entry]: http://catalogue.fiware.org/enablers/stream-oriented-kurento
[NUBOMEDIA]: http://www.nubomedia.eu

### Documentation

The Kurento project provides detailed [documentation] including tutorials,
installation and development guides. The [Open API specification], also known as
*Kurento Protocol*, is available on [apiary.io].

[documentation]: https://www.kurento.org/documentation
[Open API specification]: http://kurento.github.io/doc-kurento/
[apiary.io]: http://docs.streamoriented.apiary.io/

### Useful Links

#### Usage

* [Installation Guide](https://doc-kurento.readthedocs.io/en/latest/user/installation.html)
* [Compilation Guide](https://doc-kurento.readthedocs.io/en/latest/dev/dev_guide.html#developing-kms)
* [Contribution Guide](https://doc-kurento.readthedocs.io/en/latest/project/contribute.html)

#### Issues

* [Bug Tracker](https://github.com/Kurento/bugtracker/issues)
* [Support](https://doc-kurento.readthedocs.io/en/latest/user/support.html)

#### News

* [Kurento Blog](https://www.kurento.org/blog)
* [Google Groups](https://groups.google.com/forum/#!forum/kurento)

#### Source

All source code belonging to the Kurento project can be found in the
[Kurento GitHub organization page](https://github.com/Kurento).

## Licensing and distribution

Copyright 2014-2021 Kurento

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
