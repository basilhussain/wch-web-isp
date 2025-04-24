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

export class LoggerLevel {
	static Info = new LoggerLevel("Info", " INFO");
	static Warning = new LoggerLevel("Warning", " WARN");
	static Error = new LoggerLevel("Error", "ERROR");
	static Debug = new LoggerLevel("Debug", "DEBUG");
	
	#name;
	#shortName;
	
	constructor(name, shortName) {
		this.#name = name;
		this.#shortName = shortName;
	}
	
	get name() {
		return this.#name;
	}
	
	get shortName() {
		return this.#shortName;
	}
}

export class Logger {
	#output = console.log;
	
	constructor(outputCallback) {
		if(!(outputCallback instanceof Function)) {
			throw new Error("Output argument must be a callback function");
		}
		this.#output = outputCallback;
	}
	
	#outputMessage(msg, level = undefined) {
		if(!(level instanceof LoggerLevel)) level = LoggerLevel.Info;
		this.#output(msg, new Date(), level.name, level.shortName);
	}
	
	log(...messages) {
		for(const msg of messages) {
			this.#outputMessage(msg, LoggerLevel.Info);
		}
	}
	
	info(...messages) {
		for(const msg of messages) {
			this.#outputMessage(msg, LoggerLevel.Info);
		}
	}
	
	warn(...messages) {
		for(const msg of messages) {
			this.#outputMessage(msg, LoggerLevel.Warning);
		}
	}
	
	error(...messages) {
		for(const msg of messages) {
			this.#outputMessage(msg, LoggerLevel.Error);
		}
	}
	
	debug(...messages) {
		for(const msg of messages) {
			this.#outputMessage(msg, LoggerLevel.Debug);
		}
	}
}
