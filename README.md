# WCH RISC-V Microcontroller Web Serial ISP

This is a serial ISP flashing tool for WCH RISC-V microcontrollers that runs in a web browser. Entirely self-contained, with no additional software, libraries, or drivers required.

It uses the JavaScript [Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/SerialPort) browser API, and so requires support for this feature by the browser. At time of writing, only the following browsers feature support for the Web Serial API: Chrome version 89+, Edge version 89+, Opera version 76+. This tool does not work in FireFox and Safari, due to lack of support for the API.

> [!NOTE]
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
* Optional DTR/RTS sequence for auto-reset into bootloader.

Currently supported RISC-V WCH microcontrollers:

* CH32V00x
* CH32L103
* CH32V103
* CH32V20x
* CH32V30x
* CH32X03x

## Limitations

* This tool only works with the WCH factory bootloader. If you have overwritten a chip's bootloader code (the 'BOOT' flash area) with a custom bootloader, this tool will not be compatible.
* The WCH bootloader protocol does not support *reading* user application flash. There is no command within the bootloader to do so.
* Native USB communication is not supported.

## Building

> [!NOTE]
> **A pre-built copy can be found in the Releases section of the GitHub repository.**

Building requires the bundling tool [esbuild](https://esbuild.github.io/), a copy of which will need to be installed in a `tools` sub-folder of the project - see below for details.

### Windows

You must have a copy of the `esbuild.exe` binary executable in a `tools\esbuild` sub-folder.

1. Open a command prompt in the project folder.
2. Run `build.bat`.
3. The resultant HTML, JS, and CSS files will be output to the `dist` sub-folder.

### Linux

You must have a copy of the `esbuild` binary executable in a `tools/esbuild/bin` sub-folder.

1. Open a terminal and navigate to the project folder.
2. Run `build.sh`. You may need to first add 'execute' permissions to the script file (e.g. `chmod a+x build.sh`).
3. The resultant HTML, JS, and CSS files will be output to the `dist` sub-folder.

The Linux build script may also be useful on other Unix-like platforms - e.g. Mac, BSDs, etc. - but has not been tested with any of them.

## Running

If you downloaded a pre-built release, first extract the contents of the zip file to a location of your choice.

Open in your web browser the `index.html` file from the `dist` folder.

If you want to deploy a copy of this tool to be hosted on your own web server, simply upload all files within the `dist` folder to a location of your choice on your web server.

## Licence

This work is licenced under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). See LICENSE.txt for details.
