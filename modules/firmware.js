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

export class Firmware {
	static #parsers = new Map();
	
	#file;
	#maxSize;
	#extension;
	#bytes;
	#format;
	
	constructor(file, maxSize = 1048576) {
		this.#file = file;
		this.#maxSize = maxSize;
		const nameDotPos = file.name.lastIndexOf(".");
		this.#extension = (nameDotPos >= 0 ? file.name.slice(nameDotPos + 1).toLowerCase() : "");
		this.#format = "Unknown";
	}
	
	async parse() {
		if(this.#file.size == 0) throw new Error("No data to parse; file is empty");
		
		if(this.constructor.#parsers.has(this.#extension)) {
			// We have a parser for the file extension, so use it on the
			// contents of the file. If the parser is for text-based files, read
			// the file as a string; otherwise read binary bytes.
			const parser = this.constructor.#parsers.get(this.#extension);
			if(parser.forText) {
				const txt = await this.#file.text();
				this.#bytes = parser.parse(txt, this.#maxSize);
			} else {
				const buf = await this.#file.arrayBuffer();
				this.#bytes = parser.parse(buf, this.#maxSize);
			}
			this.#format = parser.formatName;
		} else {
			// No parser, just use the raw bytes of the file.
			const buf = await this.#file.arrayBuffer();
			this.#bytes = new Uint8Array(buf);
			this.#format = "Raw Binary";
		}
	}
	
	fillToEndOfSegment(segmentSize, fillVal = 0xFF) {
		if(this.#bytes.length % segmentSize != 0) {
			const oldSize = this.#bytes.length;
			const newSize = Math.ceil(this.#bytes.length / segmentSize) * segmentSize;
			// We need to use transfer() here to make a new buffer of the
			// desired new size, because we might have a non-resizeable
			// ArrayBuffer (because a raw binary was loaded by parse()), so
			// can't use resize(). If it was resizeable, and of big-enough
			// capacity, then the same buffer is reused by transfer().
			this.#bytes = new Uint8Array(this.#bytes.buffer.transfer(newSize));
			this.#bytes.fill(fillVal, oldSize);
		}
	}
	
	getPageCount(pageSize) {
		return Math.ceil(this.#bytes.length / pageSize);
	}
	
	getSectorCount(sectorSize) {
		return Math.ceil(this.#bytes.length / sectorSize);
	}
	
	get fileName() {
		return this.#file.name;
	}
	
	get fileExtension() {
		return this.#extension;
	}
	
	get size() {
		return this.#bytes.length;
	}
	
	get bytes() {
		return this.#bytes;
	}
	
	get format() {
		return this.#format;
	}
	
	static addParser(extensions, parser) {
		for(const ext of extensions) {
			this.#parsers.set(ext.trim().toLowerCase(), parser);
		}
	}
}
