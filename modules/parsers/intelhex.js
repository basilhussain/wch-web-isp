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

class IntelHexRecordType {
	static Data = new this("Data", 0);
	static EndOfFile = new this("End Of File", 1);
	static ExtSegmentAddr = new this("Extended Segment Address", 2);
	static StartSegmentAddr = new this("Start Segment Address", 3);
	static ExtLinearAddr = new this("Extended Linear Address", 4);
	static StartLinearAddr = new this("Start Linear Address", 5);
	
	#name;
	#value;
	
	constructor(name, value) {
		this.#name = name;
		this.#value = value;
	}
	
	get name() {
		return this.#name;
	}
	
	get value() {
		return this.#value;
	}
	
	static isValidType(value) {
		for(let t in this) {
			if(this[t].#value == value) return true;
		}
		return false;
	}
}

export class IntelHexParser {
	static #calcRecordChecksum(bytes) {
		return (~bytes.reduce((sum, val) => sum = (sum + val) % 256, 0) + 1) & 0xFF;
	}
	
	static parse(txt, maxSize = 1048576, minSize = 64, fillVal = 0xFF) {
		const lines = txt.split(/\r\n|\r|\n/);
		const output = new ArrayBuffer(minSize, { maxByteLength: maxSize });
		let idx = 0, eof = false, addrBase = 0;
		
		// Because buffer is resizeable, this array view of it will always track
		// its length whenever the buffer is resized, so we can create one now
		// and use it later to fill resized areas.
		const filler = new Uint8Array(output);
		filler.fill(fillVal);
		
		for(const line of lines) {
			++idx;
			
			// Skip blank lines.
			if(line.length == 0) continue;
			
			// Does the line meet the minimum length for a record, and does it
			// begin with a record start indicator?
			if(line.length < 11 || line[0] != ':') {
				throw new Error("Non-record or incomplete record on line " + idx);
			}
			
			// Parse the record bytes from hex digit pairs, then extract the
			// values of the individual fields.
			const bytes = new Uint8Array(line.match(/[0-9a-f]{2}/gi).map((hex) => Number.parseInt(hex, 16)));
			const count = bytes.at(0);
			const addr = new DataView(bytes.buffer, 1, 2).getUint16(0);
			const type = bytes.at(3);
			const data = bytes.subarray(4, -1);
			const checksum = bytes.at(-1);
			
			// Check the record is valid and bail out if not.
			if(count != data.length) {
				throw new Error("Byte count and length of data mismatch on line " + idx);
			}
			if(!IntelHexRecordType.isValidType(type)) {
				throw new Error("Invalid record type on line " + idx);
			}
			if(this.#calcRecordChecksum(bytes.subarray(0, -1)) != checksum) {
				throw new Error("Checksum mismatch on line " + idx);
			}
			
			switch(type) {
				case IntelHexRecordType.Data.value:
					// Resize the buffer if necessary (will throw exception
					// if max size exceeded), then fill resized area, and
					// finally stuff the data into it at the specified offset.
					if(addrBase + addr + count > output.byteLength) {
						const fillFrom = output.byteLength;
						try {
							output.resize(addrBase + addr + count);
						} catch(err) {
							if(err instanceof RangeError) {
								err = new Error("Maximum size of " + output.maxByteLength.toLocaleString() + " bytes exceeded");
							}
							throw err;
						}
						filler.fill(fillVal, fillFrom);
					}
					new Uint8Array(output, addrBase + addr, count).set(data);
					break;
				case IntelHexRecordType.EndOfFile.value:
					eof = true;
					break;
				case IntelHexRecordType.ExtSegmentAddr.value:
					throw new Error("Extended Segment Address record type not supported");
					break;
				case IntelHexRecordType.StartSegmentAddr.value:
					throw new Error("Start Segment Address record type not supported");
					break;
				case IntelHexRecordType.ExtLinearAddr.value:
					// Record's data bytes are the upper 16 bits (i.e. base
					// address) of the address of all subsequent records.
					addrBase = new DataView(bytes.buffer, 4, 2).getUint16(0) << 16;
					break;
				case IntelHexRecordType.StartLinearAddr.value:
					// Ignored, do nothing.
					break;
			}
			
			if(eof) break;
		}
		
		// Did we parse all file lines without encountering an EOF record?
		if(!eof) throw new Error("Unexpected end of file (missing EOF record) on line " + idx);
		
		return new Uint8Array(output);
	}
	
	static get forText() {
		return true;
	}
	
	static get formatName() {
		return "Intel Hex";
	}
}
