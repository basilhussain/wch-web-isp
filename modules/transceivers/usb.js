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
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * 
 ******************************************************************************/

import { Command } from "../command.js";
import { ResponseType, Response } from "../response.js";
import { Logger } from "../logger.js";
import { Formatter, Delay } from "../util.js";

const DEVICE_FILTERS = [
	{ vendorId: 0x4348, productId: 0x55E0 }, // Vendor "WinChipHead"
	{ vendorId: 0x1A86, productId: 0x55E0 }, // Vendor "QinHeng Electronics"
];

const CONFIGURATION_VALUE = 1;
const INTERFACE_NUMBER = 0;
const ENDPOINT_OUT = 0x02;
const ENDPOINT_IN = 0x02 /*0x82*/;
const ENDPOINT_TYPE = "bulk";

export class UsbTransceiver {
	#device;
	#logger = console;
	
	constructor(options) { }
	
	setLogger(logger) {
		if(!(logger instanceof Logger)) throw new Error("Logger argument must be a Logger object");
		this.#logger = logger;
	}
	
	async open() {
		if(!("usb" in navigator)) {
			throw new Error("Web USB API is unsupported by this browser");
		}
		
		this.#logger.info("Opening USB connection");
		
		try {
			this.#device = await navigator.usb.requestDevice({ filters: DEVICE_FILTERS })
		} catch(err) {
			throw new Error("USB device selection cancelled or permission denied", { cause: err });
		}
		
		this.#logger.debug(
			"USB device VID: 0x" + Formatter.hex(this.#device.vendorId, 4) +
			", PID: 0x" + Formatter.hex(this.#device.productId, 4)
		);
		
		try {
			await this.#device.open();
		} catch(err) {
			throw new Error("Failed to open USB device; ensure the WinUSB driver is installed for your device", { cause: err});
		}
		
		try {
			await this.#device.selectConfiguration(CONFIGURATION_VALUE);
			await this.#device.claimInterface(INTERFACE_NUMBER);
		} catch(err) {
			throw new Error("Failed to select USB device configuration or claim interface", { cause: err });
		}
		
		// Verify that the USB device has one each of the requisite 'in' and
		// 'out' endpoints.
		const iface = this.#device.configuration.interfaces.find((i) => i.interfaceNumber == INTERFACE_NUMBER);
		if(iface) {
			const countIn = iface.alternate.endpoints.filter((e) => {
				return (e.endpointNumber === ENDPOINT_IN && e.type === ENDPOINT_TYPE && e.direction === "in");
			}).length;
			const countOut = iface.alternate.endpoints.filter((e) => {
				return (e.endpointNumber === ENDPOINT_OUT && e.type === ENDPOINT_TYPE && e.direction === "out");
			}).length;
			if(countIn !== 1 || countOut !== 1) throw new Error("Selected USB device does not possess requisite endpoints");
		} else {
			throw new Error("Failed to locate USB device interface for enumeration of endpoints");
		}
	}
	
	async transmitCommand(cmd) {
		const payload = cmd.toBytes();
		
		this.#logger.debug("TX (" + payload.length + " bytes): " + Formatter.hex(payload, 2));
		
		const result = await this.#device.transferOut(ENDPOINT_OUT, payload);
	}
	
	async receiveResponse(respClass, timeoutMs = 3000) {
		// TODO: There doesn't appear to be any way to specify a timeout.
		const result = await this.#device.transferIn(ENDPOINT_IN, respClass.type.size);

		const payload = new Uint8Array(result.data.buffer);

		this.#logger.debug("RX (" + payload.length + " bytes): " + Formatter.hex(payload, 2));
		
		return respClass.fromBytes(payload);
	}
	
	async close() {
		if(this.#device) {
			try {
				// TODO: why is one of these sometimes throwing an exception?
				await this.#device.releaseInterface(INTERFACE_NUMBER);
				await this.#device.close();
			} catch(err) {
				throw new Error("Failed to release interface or close device", { cause: err });
			} finally {
				this.#device = null;
			}
		}
	}
}
