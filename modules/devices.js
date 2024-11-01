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

import { Formatter } from "./util.js";

export class DevicesDatabase /*extends EventTarget*/ {
	#devices = [];
	// #loaded = false;
	
	constructor() {
		// super();
	}
	
	async fetchDevices(url) {
		const response = await window.fetch(url, { headers: { "Accept": "application/json" } });
		if(response.ok) {
			try {
				this.#devices = await response.json();
			} catch(err) {
				throw new Error("Error parsing device JSON data", { cause: err });
			}
		} else {
			throw new Error(
				"Error fetching device JSON data from \"" + response.url + "\"",
				{ cause: new Error("Server response: " + response.status + " " + response.statusText) }
			);
		}
	}
	
	/*
	fetchDevices(url) {
		this.#devices = [];
		this.#loaded = false;
		
		window.fetch(url, { headers: { "Accept": "application/json" } })
			.then((response) => {
				if(!response.ok) throw new Error("Error fetching \"" + response.url + "\"; " + response.status + " " + response.statusText);
				return response.json();
			})
			.then((json) => {
				this.#devices = json;
				this.#loaded = true;
				this.dispatchEvent(new CustomEvent("loaded"));
			})
			.catch((err) => {
				this.dispatchEvent(new CustomEvent("error", { detail: err }));
			});
	}
	*/

	populateDeviceList(list) {
		this.#devices.forEach((fam, famIdx) => {
			const grp = document.createElement("optgroup");
			grp.setAttribute("label", fam["family"]);
			
			fam["devices"].forEach((dev, devIdx) => {
				const opt = document.createElement("option");
				opt.setAttribute("value", famIdx.toString() + ":" + devIdx.toString());
				opt.textContent = dev["name"] + " (" + dev["package"] + ", " + Formatter.byteSize(dev["flash"]["size"]) + ")";
				grp.appendChild(opt);
			});
			
			list.appendChild(grp);
		});
	}

	findDevice(val) {
		const indices = val.split(":").map((str) => Number.parseInt(str));
		
		if(indices.length == 2) {
			const family = this.#devices.at(indices[0]);
			if(family instanceof Object) {
				const device = family["devices"].at(indices[1]);
				if(device instanceof Object) {
					return device;
				}
			}
		}
		
		throw new Error("Device not found or invalid specifier string");
	}
	
	/*
	get loaded() {
		return this.#loaded;
	}
	*/
}
