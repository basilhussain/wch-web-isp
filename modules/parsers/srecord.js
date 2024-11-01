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

class SRecordRecordType {
	static Header = new this("Header", 0);
	static Data16BitAddr = new this("Data (16-bit Address)", 1);
	static Data24BitAddr = new this("Data (24-bit Address)", 2);
	static Data32BitAddr = new this("Data (32-bit Address)", 3);
	static Reserved = new this("Reserved", 4);
	static RecordCount16Bit = new this("Record Count (16-bit)", 5);
	static RecordCount24Bit = new this("Record Count (24-bit)", 6);
	static StartAddr32Bit = new this("Start Address (32-bit)", 7);
	static StartAddr24Bit = new this("Start Address (24-bit)", 8);
	static StartAddr16Bit = new this("Start Address (16-bit)", 9);
	
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

export class SRecordParser {
	static #calcRecordChecksum(bytes) {
		return 0xFF - bytes.reduce((sum, val) => sum = (sum + val) % 256, 0);
	}
	
	static parse(txt, maxSize = 1048576, minSize = 64, fillVal = 0xFF) {
		const lines = txt.split(/\r\n|\r|\n/);
		const output = new ArrayBuffer(minSize, { maxByteLength: maxSize });
		let idx = 0, eof = false;
		
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
			if(line.length < 10 || line[0] != 'S') {
				throw new Error("Non-record or incomplete record on line " + idx);
			}
			
			// Parse the record bytes from hex digit pairs, then extract the
			// values of the individual fields.
			const type = line.charCodeAt(1) - 0x30;
			const bytes = new Uint8Array(line.slice(2).match(/[0-9a-f]{2}/gi).map((hex) => Number.parseInt(hex, 16)));
			const count = bytes.at(0);
			const checksum = bytes.at(-1);
			
			// Check the record is valid and bail out if not.
			if(!SRecordRecordType.isValidType(type)) {
				throw new Error("Invalid record type on line " + idx);
			}
			if(count != bytes.length - 1) {
				throw new Error("Byte count and length of data mismatch on line " + idx);
			}
			if(this.#calcRecordChecksum(bytes.subarray(0, -1)) != checksum) {
				throw new Error("Checksum mismatch on line " + idx);
			}
			
			const mergeDataToOutput = (addr, data) => {
				if(addr + data.length > output.byteLength) {
					const fillFrom = output.byteLength;
					try {
						output.resize(addr + data.length);
					} catch(err) {
						if(err instanceof RangeError) {
							err = new Error("Maximum size of " + output.maxByteLength.toLocaleString() + " bytes exceeded");
						}
						throw err;
					}
					filler.fill(fillVal, fillFrom);
				}
				new Uint8Array(output, addr, data.length).set(data);
			};
			
			switch(type) {
				case SRecordRecordType.Data16BitAddr.value:
					mergeDataToOutput(
						new DataView(bytes.buffer, 1, 2).getUint16(0),
						bytes.subarray(3, -1)
					);
					break;
				case SRecordRecordType.Data24BitAddr.value:
					// There is no 24-bit integer support in DataView, so we
					// instead read as a 32-bit integer and shift off the excess
					// byte.
					mergeDataToOutput(
						new DataView(bytes.buffer, 1, 4).getUint32(0) >> 8,
						bytes.subarray(4, -1)
					);
					break;
				case SRecordRecordType.Data32BitAddr.value:
					mergeDataToOutput(
						new DataView(bytes.buffer, 1, 4).getUint32(0),
						bytes.subarray(5, -1)
					);
					break;
				case SRecordRecordType.Header.value:
				case SRecordRecordType.Reserved.value:
				case SRecordRecordType.RecordCount16Bit.value:
				case SRecordRecordType.RecordCount24Bit.value:
					// Ignored, do nothing.
					break;
				case SRecordRecordType.StartAddr32Bit.value:
				case SRecordRecordType.StartAddr24Bit.value:
				case SRecordRecordType.StartAddr16Bit.value:
					eof = true;
					break;
			}
			
			if(eof) break;
		}
		
		// Did we parse all file lines without encountering a termination record?
		if(!eof) throw new Error("Unexpected end of file (missing termination record) on line " + idx);
		
		return new Uint8Array(output);
	}
	
	static get forText() {
		return true;
	}
	
	static get formatName() {
		return "S-Record";
	}
}
