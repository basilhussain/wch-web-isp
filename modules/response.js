import { Packet } from "./packet.js";

export class ResponseType {
	static Identify = new ResponseType("Identify", 0xA1, 6);
	static End = new ResponseType("End", 0xA2, 6);
	static Key = new ResponseType("Key", 0xA3, 6);
	static FlashErase = new ResponseType("FlashErase", 0xA4, 6);
	static FlashWrite = new ResponseType("FlashWrite", 0xA5, 6);
	static FlashVerify = new ResponseType("FlashVerify", 0xA6, 6);
	static ConfigRead = new ResponseType("ConfigRead", 0xA7, 30);
	static ConfigWrite = new ResponseType("ConfigWrite", 0xA8, 6);
	
	#name;
	#code;
	#size;
	
	constructor(name, code, size) {
		this.#name = name;
		this.#code = code;
		this.#size = size;
	}
	
	toString() {
		return "ResponseType." + this.#name;
	}
	
	get code() {
		return this.#code;
	}
	
	get size() {
		return this.#size;
	}
	
	static fromCode(code) {
		for(let t in ResponseType) {
			if(ResponseType[t].#code == code) return ResponseType[t];
		}
		return undefined;
	}
}

export class Response {
	#type;
	#data = [];
	#length = 0;
	
	constructor(type, data, length = data.length) {
		this.#type = type;
		this.#data = data;
		this.#length = length;
	}
	
	// TODO: maybe change this to a read-only property?
	isValid() {
		return (
			this.#type instanceof ResponseType &&
			this.#length > 0 &&
			this.#data.length > 0 &&
			this.#length == this.#data.length
		);
	}
	
	get data() {
		return this.#data;
	}
	
	get length() {
		return this.#length;
	}
	
	static fromPacket(packet) {
		return this.fromBytes(packet.payload);
	}
	
	static fromBytes(bytes) {
		if(bytes.length >= 4) {
			return new this(
				ResponseType.fromCode(bytes[0]),
				bytes.slice(4),
				new DataView(bytes.buffer).getUint16(2, true) // little-endian
			);
		} else {
			return undefined;
		}
	}
}

export class IdentifyResponse extends Response {
	get success() {
		// Bootloader returns 0xF1 for incorrect password.
		return (this.length == 2 && this.data[0] < 0xF0);
	}
	
	get deviceVariant() {
		return this.data[0];
	}
	
	get deviceType() {
		return this.data[1];
	}
}

export class EndResponse extends Response {
	get success() {
		return (this.length == 2 && this.data[0] == 0x00);
	}
}

export class KeyResponse extends Response {
	get success() {
		// Bootloader returns 0xFE for seed too short.
		// Impossible to differentiate between a key checksum that happens to be
		// 0xFE and error response, so instead consider anything non-zero a
		// success response.
		return (this.length == 2 && this.data[0] > 0x00);
	}
	
	get keyChecksum() {
		return this.data[0];
	}
}

export class FlashEraseResponse extends Response {
	get success() {
		return (this.length == 2 && this.data[0] == 0x00);
	}
}

export class FlashWriteResponse extends Response {
	get success() {
		return (this.length == 2 && this.data[0] == 0x00);
	}
}

export class FlashVerifyResponse extends Response {
	get success() {
		// Bootloader returns 0xF5 or 0xFE on error.
		return (this.length == 2 && this.data[0] == 0x00);
	}
}

export class ConfigReadResponse extends Response {
	get success() {
		// Command always requests 'all' config data (0x1F), so length should
		// always be 26.
		return (this.length == 26 && this.data[0] > 0x00);
	}
	
	get optionBytesRaw() {
		// Return a simple array of the bytes, omitting all of the inverse 'n'
		// values.
		return [
			this.data[2], this.data[4], this.data[6], this.data[8]
		].concat(Array.from(this.data.subarray(10, 14)));
	}
	
	get optionBytes() {
		return {
			"rdpr": this.data[2],
			"user": this.data[4],
			"data": [this.data[6], this.data[8]],
			"wrpr": Array.from(this.data.subarray(10, 14))
		};
	}
	
	get bootloaderVersion() {
		return {
			"major": (this.data[14] * 10) + this.data[15],
			"minor": (this.data[16] * 10) + this.data[17]
		};
	}
	
	get chipUniqueID() {
		return this.data.slice(18);
	}
}

export class ConfigWriteResponse extends Response {
	get success() {
		return (this.length == 2 && this.data[0] == 0x00);
	}
}

export class InvalidResponseError extends Error {
	constructor() {
		super("Invalid response; unknown type or bad data length");
	}
}

export class UnsuccessfulResponseError extends Error {
	constructor() {
		super("Unsuccessful response; command returned error");
	}
}
