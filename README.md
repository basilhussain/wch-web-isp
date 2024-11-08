# WCH RISC-V Microcontroller Web Serial ISP

This is a serial ISP flashing tool for WCH RISC-V microcontrollers that runs in a web browser. Entirely self-contained, with no additional software, libraries, or drivers required.

It uses the JavaScript [Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/SerialPort) browser API, and so requires support for this feature by the browser. At time of writing, only the following browsers feature support for the Web Serial API: Chrome version 89+, Edge version 89+, Opera version 76+. This tool does not work in FireFox and Safari, due to lack of support for the API.

> **You can find a hosted version of this tool on my website, at: [https://www.stasisleak.uk/wchisp/](https://www.stasisleak.uk/wchisp/).**

## Features

* Connect using any available serial port (e.g. COM/TTY) interface.
* Write, verify, and erase user application flash.
* Read and write configuration option bytes.
* Loads firmware images in these formats:
  * Intel Hex
  * S-Record
  * ELF
  * Raw binary
* Load firmware from local file or external URL.
* Can take query string parameters to auto-select device and/or auto-load firmware from URL.
* Hex preview listing of loaded firmware image.

Currently supported RISC-V WCH microcontrollers:

* CH32V003
* CH32L103
* CH32V103
* CH32V20x
* CH32V30x
* CH32X03x

## Self-Hosting

If you want to deploy a copy of this tool to be hosted on your own web server, installation is simple:

1. Copy all files and sub-folders to a location of your choice on your web server.
2. Load that server URL in your web browser.
3. Done! Nothing else required. 😄

Please note that it is not possible to run this tool locally by loading `index.html` into a browser (i.e. straight from the filesystem via `file://`) due to [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) JS module restrictions.

## Licence

This work is licenced under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). See LICENCE.txt for details.
