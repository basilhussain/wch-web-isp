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
