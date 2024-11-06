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

export class DevicesDatabase {
	#devices = [];
	
	constructor() { }
	
	async fetchDevicesData(url) {
		let response;
		
		try {
			response = await window.fetch(url, { headers: { "Accept": "application/json" } });
		} catch(err) {
			throw new Error("Error fetching device JSON data from \"" + url + "\"", { cause: err });
		}
		
		if(response.ok) {
			try {
				this.#devices = await response.json();
			} catch(err) {
				throw new Error("Error parsing device JSON data", { cause: err });
			}
		} else {
			throw new Error(
				"Error fetching device JSON data from \"" + url + "\"",
				{ cause: new Error("Server response: " + response.status + " " + response.statusText) }
			);
		}
	}

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

	findDeviceByIndex(val) {
		const [famIdx, devIdx] = val.split(":").map((str) => Number.parseInt(str));
		
		if(famIdx >= 0 && devIdx >= 0) {
			const family = this.#devices.at(famIdx);
			if(family) {
				const device = family["devices"].at(devIdx);
				if(device) {
					return device;
				}
			}
		}
		
		throw new Error("Device not found or invalid index string");
	}
	
	findDeviceIndexByName(name) {
		name = name.trim().toLowerCase();
		
		let famIdx, devIdx;
		
		famIdx = this.#devices.findIndex((fam) => {
			devIdx = fam["devices"].findIndex((dev) => dev["name"].toLowerCase() === name);
			return (devIdx >= 0);
		});
		
		return (famIdx >= 0 && devIdx >= 0 ? famIdx + ":" + devIdx : null);
	}
}
