/*******************************************************************************
 *
 * WCH RISC-V Microcontroller Web Serial ISP
 * Copyright (c) 2025 Basil Hussain
 * 
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
 * details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 * 
 ******************************************************************************/

import { Packet } from "./packet.js";

// Some USB-UART interfaces for unknown reason don't like to have their port
// reading stream flushed and will hang indefinitely and not return from
// readable.cancel(). This shall be a list of USB devices for which we will
// avoid doing that.
//
// Tested works with flush:
// - Non-USB COM port (e.g. mobo on-board)
// - WCHLink-E COM port: USB\VID_1A86&PID_8010&MI_01
// - WCH CH340G: USB\VID_1A86&PID_7523
// - FTDI FT2232H: FTDIBUS\COMPORT&VID_0403&PID_6010
// Doesn't work:
// - Silabs CP2102N: USB\VID_10C4&PID_EA60
const PORT_FLUSH_BLOCKLIST = [
	// Silicon Labs CP2102N
	{ vid: 0x10C4, pid: 0xEA60 },
	{ vid: 0x10C4, pid: 0xEA61 },
	{ vid: 0x10C4, pid: 0xEA63 },
];

export class Transceiver {
	#port;
	
	#canFlushPort(vid, pid) {
		// If the given VID/PID are in the list, we should not attempt to flush.
		return !PORT_FLUSH_BLOCKLIST.some((elem) => elem.vid === vid && elem.pid === pid);
	}
	
	async open() {
		if(!("serial" in navigator)) {
			throw new Error("Web Serial API is unsupported by this browser");
		}
		
		try {
			this.#port = await navigator.serial.requestPort();
		} catch(err) {
			throw new Error("Serial port selection cancelled or permission denied", { cause: err });
		}
		
		const portInfo = this.#port.getInfo();
		
		try {
			await this.#port.open({
				baudRate: 115200,
				dataBits: 8,
				stopBits: 1,
				parity: "none",
				flowControl: "none"
			});
			
			if(this.#canFlushPort(portInfo.usbVendorId, portInfo.usbProductId)) {
				// Flush the port's reading stream. For some reason, sometimes
				// spurious bytes are already waiting, which messes up receiving
				// packets (because more data than expected is received).
				await this.#port.readable.cancel();
			}
		} catch(err) {
			throw new Error("Error occurred attempting to open serial port", { cause: err });
		}
	}
	
	async transmitPacket(packet) {
		const writer = this.#port.writable.getWriter();
		
		await writer.write(packet.toBytes());
		
		writer.releaseLock();
	}
	
	async receivePacket(length, timeout_ms = 3000) {
		const bytes = new Uint8Array(length);
		let offset = 0, stop = false, error;
		// let iterations = 0;
		
		const reader = this.#port.readable.getReader();
		
		const timer = setTimeout(() => {
			// Timeout expired, so stop reading by releasing the reader lock.
			// This will cause any waiting reader.read() to throw an error.
			stop = true;
			reader.releaseLock();
		}, timeout_ms);
		
		while(!stop && offset < bytes.length) {
			try {
				const { value: chunk, done } = await reader.read();
				
				// console.debug(iterations, chunk);
				
				if(done) break;
				if(offset + chunk.length <= bytes.length) {
					bytes.set(chunk, offset);
					offset += chunk.length;
				} else {
					error = new Error("Unexpected data; received more than " + bytes.length + " bytes");
					break;
				}
			} catch(err) {
				// Catch the error thrown by the reader on timeout (or other
				// error) and re-throw a more suitable error.
				error = new Error("Timed-out after " + timeout_ms + " ms waiting to receive, or read failure", { cause: err });
				break;
			}
			
			// iterations++;
		}
		
		clearTimeout(timer);
		reader.releaseLock();
		
		if(error) throw error;
		
		return Packet.fromBytes(bytes);
	}
	
	async close() {
		if(this.#port !== undefined) {
			await this.#port.close();
		}
	}
}
