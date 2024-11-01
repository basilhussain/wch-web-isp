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
 ******************************************************************************/

export class CommandType {
	static Identify = new CommandType("Identify", 0xA1);
	static End = new CommandType("End", 0xA2);
	static Key = new CommandType("Key", 0xA3);
	static FlashErase = new CommandType("FlashErase", 0xA4);
	static FlashWrite = new CommandType("FlashWrite", 0xA5);
	static FlashVerify = new CommandType("FlashVerify", 0xA6);
	static ConfigRead = new CommandType("ConfigRead", 0xA7);
	static ConfigWrite = new CommandType("ConfigWrite", 0xA8);
	
	#name;
	#code;
	
	constructor(name, code) {
		this.#name = name;
		this.#code = code;
	}
	
	toString() {
		return "CommandType." + this.#name;
	}
	
	get code() {
		return this.#code;
	}
	
	static isValidCode(code) {
		for(let t in CommandType) {
			if(CommandType[t].#code == code) return true;
		}
		return false;
	}
}

export class Command {
	#type;
	#data = [];
	#length = 0;
	
	constructor(type, data, length = data.length) {
		this.#type = type;
		this.#data = data;
		this.#length = length;
	}

	toBytes() {
		const buf = new ArrayBuffer(this.#length + 3);
		const bytes = new Uint8Array(buf);
		
		// Set the length in 16-bit little-endian format.
		bytes[0] = this.#type.code;
		new DataView(buf).setUint16(1, this.#length, true);
		bytes.set(this.#data, 3);
		
		return bytes;
	}
	
	get data() {
		return this.#data;
	}
	
	get length() {
		return this.#length;
	}
}

export class IdentifyCommand extends Command {
	constructor(dev_variant, dev_type) {
		const passwd = "MCU ISP & WCH.CN";
		
		const data = new Uint8Array(2 + passwd.length);
		data[0] = dev_variant;
		data[1] = dev_type;
		new TextEncoder().encodeInto(passwd, data.subarray(2));
		
		super(CommandType.Identify, data);
	}
}

export class EndCommand extends Command {
	constructor(do_reset) {
		super(CommandType.End, [(do_reset ? 0x01 : 0x00)]);
	}
}

export class KeyCommand extends Command {
	#key = new Uint8Array(8);
	#key_checksum = 0;
	
	constructor(unique_id, dev_variant, seed_len = 60) {
		// Ensure the given seed length is within allowable bounds, then
		// determine parameters for the encryption according to seed length.
		// Finally, generate random seed data of the appropriate length.
		seed_len = Math.min(Math.max(seed_len, 30), 60);
		const a = Math.floor(seed_len / 5);
		const b = Math.floor(seed_len / 7);
		const seed = crypto.getRandomValues(new Uint8Array(seed_len));
		
		super(CommandType.Key, seed);
		
		// Calculate a simple checksum of all the given unique ID bytes.
		const unique_id_checksum = unique_id.reduce((acc, val) => acc = (acc + val) % 256, 0);
		
		// Calculate the encryption key according to previously determined
		// parameters and seed.
		this.#key[0] = unique_id_checksum ^ seed[b * 4];
		this.#key[1] = unique_id_checksum ^ seed[a];
		this.#key[2] = unique_id_checksum ^ seed[b];
		this.#key[3] = unique_id_checksum ^ seed[b * 6];
		this.#key[4] = unique_id_checksum ^ seed[b * 3];
		this.#key[5] = unique_id_checksum ^ seed[a * 3];
		this.#key[6] = unique_id_checksum ^ seed[b * 5];
		this.#key[7] = (this.#key[0] + dev_variant) % 256;
		
		// Calculate a simple checksum of the key.
		this.#key_checksum = this.#key.reduce((acc, val) => acc = (acc + val) % 256, 0);
	}
	
	get key() {
		return this.#key;
	}
	
	get keyChecksum() {
		return this.#key_checksum;
	}
}

export class FlashEraseCommand extends Command {
	constructor(num_sectors) {
		// Count of sectors parameter is a 32-bit little-endian integer.
		const buf = new ArrayBuffer(4);
		new DataView(buf).setUint32(0, num_sectors, true);
		
		super(CommandType.FlashErase, new Uint8Array(buf));
	}
}

export class FlashWriteCommand extends Command {
	constructor(addr, data, key) {
		// Set flash address/offset as 32-bit little-endian integer, and
		// XOR-encrypt the provided data (which may be zero-length) with the
		// given key.
		const buf = new ArrayBuffer(5 + data.length);
		new DataView(buf).setUint32(0, addr, true);
		if(data.length > 0 && key.length > 0) {
			new Uint8Array(buf, 5, data.length).set(data.map((val, idx) => val ^ key[idx % key.length]));
		}
		
		super(CommandType.FlashWrite, new Uint8Array(buf));
	}
}

export class FlashVerifyCommand extends Command {
	constructor(addr, data, key) {
		// Set flash address/offset as 32-bit little-endian integer, and
		// XOR-encrypt the provided data (which may be zero-length) with the
		// given key.
		const buf = new ArrayBuffer(5 + data.length);
		new DataView(buf).setUint32(0, addr, true);
		if(data.length > 0 && key.length > 0) {
			new Uint8Array(buf, 5, data.length).set(data.map((val, idx) => val ^ key[idx % key.length]));
		}
		
		super(CommandType.FlashVerify, new Uint8Array(buf));
	}
}

export class ConfigReadCommand extends Command {
	constructor() {
		// Bit-mask values:
		// USER & RDPR = 0x01
		// DATA0 & DATA1 = 0x02
		// WRPR = 0x04
		// BTVER = 0x08
		// UNIID = 0x10
		// ALL = 0x1F
		// Just read 'all' config items for now.
		super(CommandType.ConfigRead, [0x1F, 0x00]);
	}
}

export class ConfigWriteCommand extends Command {
	constructor(config) {
		const data = new Uint8Array(14);
		
		// Just write 'all' config items for now.
		data[0] = 0x07; // Bit-mask
		data[2] = config[0]; // RDPR
		data[3] = ~config[0]; // nRDPR
		data[4] = config[1]; // USER
		data[5] = ~config[1]; // nUSER
		data[6] = config[2]; // DATA0
		data[7] = ~config[2]; // nDATA0
		data[8] = config[3]; // DATA1
		data[9] = ~config[3]; // nDATA1
		data.set(config.slice(4, 8), 10); // WRPR0-3 (no 'n' inverse)
		
		super(CommandType.ConfigWrite, data);
	}
}
