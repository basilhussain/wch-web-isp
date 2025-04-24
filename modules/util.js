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

const BYTE_UNITS = ["B", "KiB", "MiB"];

export class Formatter {
	static hex(values, minLen = 0) {
		// Check if values argument is iterable with reduce() - e.g. Array,
		// Uint8Array, etc. Otherwise, make it a single element array.
		if(!values.reduce) values = [values];
		
		// Hexadecimal encode and pad with zeroes to given minimum length.
		return values.reduce((str, val) => {
			return str + val.toString(16).padStart(minLen, "0");
		}, "").toUpperCase();
	}
	
	static binary(values) {
		// Check if values argument is iterable with reduce() - e.g. Array,
		// Uint8Array, etc. Otherwise, make it a single element array.
		if(!values.reduce) values = [values];
		
		return values.reduce((str, val) => str + val.toString(2), "");
	}
	
	static printableText(values, non = ".") {
		// Check if values argument is iterable with reduce() - e.g. Array,
		// Uint8Array, etc. Otherwise, make it a single element array.
		if(!values.reduce) values = [values];
		
		// Only output text for printable ASCII characters, otherwise supplied
		// non-printable character string argument.
		return values.reduce((str, val) => {
			return str + ((val >= 0x20 && val <= 0x7E) ? String.fromCharCode(val) : non);
		}, "");
	}
	
	static byteSize(value) {
		const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), BYTE_UNITS.length - 1);
		value /= 1024 ** exponent;
		return value.toLocaleString() + " " + BYTE_UNITS[exponent];
	}
}

export class Delay {
	static milliseconds(ms) {
		return new Promise((r) => setTimeout(r, ms));
	}
}

export class ContentDispositionDecoder {
	static #entityDecode(str) {
		return new Uint8Array(
			// Find all percent-hex-encoded values, or regular characters, and
			// decode the hex digits to, or convert chars to, integers.
			str
				.match(/((?:%[0-9a-fA-F]{2})|.)/g)
				.map((val) => val.startsWith("%") ? parseInt(val.slice(-2), 16) : val.charCodeAt(0))
		);
	}
	
	static #getFilenameParam(str) {
		let name = null;
		
		// Look for a filename parameter with either a quoted or plain name.
		// Capture two groups: first will be quoted name, or second will be
		// plain name.
		const match = str.match(/filename=(?:"((?:[^"]|\\")+)"|([^ ]+))(?:;|$)/);
		
		if(match) {
			if(match[1]) {
				// For a quoted name, replace all backslash-escaped characters
				// with the plain character.
				name = match[1].replaceAll(/\\(.)/g, "$1");
			} else if(match[2]) {
				name = match[2];
			}
		}
		
		return name;
	}
	
	static #getEncodedFilenameParam(str) {
		let name = null;
		
		// Look for a filename parameter encoded according to RFC5987, section
		// 3.2 - with charset, optional language, and entity-encoded name.
		// Capture three groups, one for each of the aforementioned values.
		const match = str.match(/filename\*=([\w-]+)'([\w-]*)'(.+?)(?:;|$)/);
		
		if(match && match[1] && match[3]) {
			// Decode the name using the given charset.
			const bytes = this.#entityDecode(match[3]);
			name = new TextDecoder(match[1]).decode(bytes);
		}
		
		return name;
	}
	
	static getFilename(value) {
		// In order of priority, return either:
		// 1. an encoded "filename*=" parameter, or;
		// 2. a plain or quoted-string "filename=" parameter, or;
		// 3. a default name if neither of the above could be found.
		return this.#getEncodedFilenameParam(value) || this.#getFilenameParam(value) || "[unknown]";
	}
}
