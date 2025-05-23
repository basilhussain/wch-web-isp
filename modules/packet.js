/*******************************************************************************
 *
 * WCH RISC-V Microcontroller Web Serial ISP
 * Copyright (c) 2024 Basil Hussain
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

import { Command } from "./command.js";
import { ResponseType } from "./response.js";
import { Formatter } from "./util.js";

export class PacketType {
	static Command = new PacketType('Command', [0x57, 0xAB]);
	static Response = new PacketType('Response', [0x55, 0xAA]);
	
	#name;
	#header;
	
	constructor(name, header) {
		this.#name = name;
		this.#header = header;
	}
	
	toString() {
		return "PacketType." + this.#name;
	}
	
	get header() {
		return this.#header;
	}
}

export class Packet {
	#type;
	#header = [];
	#payload = [];
	#checksum = 0;
	
	constructor(payload, type = PacketType.Command) {
		this.#type = type;
		this.#header = type.header;
		this.#payload = payload;
		this.#checksum = this.calculateChecksum();
	}
	
	calculateChecksum() {
		return this.#payload.reduce((acc, val) => acc = (acc + val) % 256, 0);
	}
	
	// TODO: maybe change this to a read-only property?
	isValid() {
		return (
			this.#header.length == this.#type.header.length &&
			this.#header.every((val, idx) => val == this.#type.header[idx]) &&
			this.#checksum == this.calculateChecksum()
		);
	}
	
	toBytes() {
		const packet = new Uint8Array(this.#payload.length + 3);
		packet.set(this.#header, 0);
		packet.set(this.#payload, 2);
		packet[this.#payload.length + 2] = this.#checksum;
		return packet;
	}
	
	toString() {
		let str = "";
		str += Formatter.hex(this.#header, 2);
		str += Formatter.hex(this.#payload, 2);
		str += Formatter.hex(this.#checksum, 2);
		return str;
	}
	
	get length() {
		return this.#header.length + this.#payload.length + 1;
	}
	
	get payload() {
		return this.#payload;
	}
	
	static fromCommand(cmd) {
		return new this(cmd.toBytes());
	}
	
	static fromBytes(bytes) {
		if(bytes.length >= 3) {
			const packet = new this(bytes.slice(2, -1), PacketType.Response);
			packet.#header = bytes.slice(0, 2);
			packet.#checksum = bytes.at(-1);
			return packet;
		} else {
			return undefined;
		}
	}
	
	static sizeForResponseType(type) {
		return type.size + 3;
	}
}

export class InvalidPacketError extends Error {
	constructor() {
		super("Invalid packet; bad header or checksum");
	}
}
