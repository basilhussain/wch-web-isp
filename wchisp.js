/*******************************************************************************
 *
 * WCH RISC-V Microcontroller Web Serial ISP
 * Copyright (c) 2025 Basil Hussain
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

import { IntelHexParser } from "./modules/parsers/intelhex.js";
import { SRecordParser } from "./modules/parsers/srecord.js";
import { ElfRiscVParser } from "./modules/parsers/elf.js";
import { FirmwareLoader, Firmware } from "./modules/firmware.js";
import { Session } from "./modules/session.js";
import { DevicesDatabase } from "./modules/devices.js";
import { Logger } from "./modules/logger.js";
import { Formatter } from "./modules/util.js";

/******************************************************************************/

function clearHexListing() {
	document.getElementById("fw_hex").replaceChildren();
}

function createHexListing(bytes, fileName) {
	const container = document.getElementById("fw_hex");
	const offset_max_digits = bytes.length.toString(16).length;
	const groups_count = 8;
	const row_size = groups_count * 2;
	
	// console.time("createHexListing");
	
	for(let i = 0; i < bytes.length; i += row_size) {
		let data = "", text = "";
		for(let j = 0; j < groups_count; j++) {
			const n = i + (j * 2);
			if(n < bytes.length) {
				data += Formatter.hex(bytes[n], 2);
				text += Formatter.printableText(bytes[n], "·");
			}
			if(n + 1 < bytes.length) {
				data += Formatter.hex(bytes[n + 1], 2);
				text += Formatter.printableText(bytes[n + 1], "·");
			}
			data += " ";
		}
		
		const offset = document.createElement("span");
		offset.classList.add("o");
		offset.textContent = "0x" + Formatter.hex(i, offset_max_digits);
		
		const printable = document.createElement("span");
		printable.classList.add("p");
		printable.textContent = text;
		
		const br = document.createElement("br");
		
		container.append(offset, data.trimEnd(), printable, br);
	}
	
	// console.timeEnd("createHexListing");
	
	document.getElementById("fw_name_val").textContent = fileName;
	document.getElementById("fw_size_val").textContent = bytes.length.toLocaleString();
}

function updateUrlLoadProgress(event) {
	const bar = document.getElementById("fw_url_progress");
	
	// When either event value is null, make the progress bar 'indeterminate'
	// by removing its 'value' attribute. Otherwise, set its value accordingly.
	if(event.detail.increment === null || event.detail.total === null) {
		bar.removeAttribute("value");
	} else {
		const val = Math.min(event.detail.increment / event.detail.total, 1.0);
		bar.setAttribute("value", val);
	}
}

function configInputIds() {
	const inputIds = [
		"cfg_rdpr", "cfg_user", "cfg_data0", "cfg_data1",
		"cfg_wrpr0", "cfg_wrpr1", "cfg_wrpr2", "cfg_wrpr3"
	];
	return inputIds;
}

function populateConfig(config) {
	if("optionBytes" in config) {
		configInputIds().forEach((id, idx) => {
			document.getElementById(id).value = "0x" + Formatter.hex(config.optionBytes[idx], 2)
		});
	}
}

function getConfigIsValid() {
	// Return whether all config input fields are valid according to their
	// constraints, and that their value parses successfully as a hex string.
	return configInputIds().every((id) => {
		const input = document.getElementById(id);
		return input.checkValidity() && !Number.isNaN(Number.parseInt(input.value, 16));
	});
}

function getConfigBytes() {
	if(!getConfigIsValid()) {
		throw new Error("One or more configuration option byte values is missing or invalid");
	}
	
	return configInputIds().map((id) => Number.parseInt(document.getElementById(id).value, 16));
}

function setActionButtonsEnabled(enable, ids = null) {
	const buttons = document.querySelectorAll("#actions > button");
	const prevState = new Array(buttons.length);
	
	buttons.forEach((btn, idx) => {
		prevState[idx] = btn.disabled;
		
		// Enable/disable either all buttons if only boolean arg given, or if
		// additional arg array given, only buttons with those given ids.
		if(!Array.isArray(ids) || ids.includes(btn.id)) {
			btn.disabled = !enable;
		}
	});
	
	return prevState;
}

function restoreActionButtonsEnabled(prevState) {
	document.querySelectorAll("#actions > button").forEach((btn, idx) => {
		btn.disabled = prevState[idx];
	});
}

function checkFirmwareSize(fwSize, flashSize) {
	if(fwSize > flashSize) {
		window.alert(
			"Currently loaded firmware file size is LARGER than device flash size!\n\n" +
			"Firmware size: " + Formatter.byteSize(fwSize) + "\n" +
			"Device flash size: " + Formatter.byteSize(flashSize)
		);
		setActionButtonsEnabled(false, ["flash_write", "flash_verify"]);
	} else {
		setActionButtonsEnabled(true, ["flash_write", "flash_verify"]);
	}
}

function getConnectionParams() {
	const usb = document.getElementById("device_connect_usb");
	const uart = document.getElementById("device_connect_uart");
	const reset = document.getElementById("device_dtr_rts_reset");
	
	let params = {
		method: undefined,
		options: { dtrRtsReset: reset.checked }
	};
	
	if(usb.checked) {
		params.method = usb.value;
	} else if(uart.checked) {
		params.method = uart.value;
	}
	
	if(!params.method) {
		throw new Error("Connection method not selected; choose either USB or UART");
	}
	
	return params;
}

function updateOperationProgress(event) {
	const bar = document.getElementById("progress_bar");
	const pct = document.getElementById("progress_pct");
	const icon = document.getElementById("progress_result");
	
	// When either event value is null, make the progress bar 'indeterminate'
	// by removing its 'value' attribute. Otherwise, set its value accordingly.
	if(event.detail.increment === null || event.detail.total === null) {
		bar.removeAttribute("value");
		pct.textContent = "∞";
	} else {
		const val = Math.min(event.detail.increment / event.detail.total, 1.0);
		bar.setAttribute("value", val);
		pct.textContent = Math.floor(val * 100) + "%";
	}
	
	icon.classList.remove("failure", "success");
	icon.removeAttribute("title");
}

function updateOperationResult(success) {
	const icon = document.getElementById("progress_result");
	
	icon.classList.remove("failure", "success");
	icon.classList.add(success ? "success" : "failure");
	icon.setAttribute("title", "Operation " + (success ? "succeeded" : "failed"));
	
	if(!success) window.alert(
		"Operation failed!\n\n" +
		"See log for details."
	);
}

function logMessage(msg, date, levelName, levelShortName) {
	const log = document.getElementById("log");
	const debug = document.getElementById("log_debug");
	
	if(levelName !== "Debug" || (debug.checked && levelName === "Debug")) {
		const line = document.createElement("p");
		
		const time = document.createElement("span");
		time.classList.add("time");
		time.textContent = date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			fractionalSecondDigits: 3
		});
		
		const level = document.createElement("span");
		level.classList.add("level", levelName.toLowerCase());
		level.textContent = levelShortName;
		
		line.append("[", time, "][", level, "] ", msg);
		log.appendChild(line);
		log.scrollTop = log.scrollHeight;
	}
}

function clearLog() {
	document.getElementById("log").replaceChildren();
}

/******************************************************************************/

const loader = new FirmwareLoader();
const logger = new Logger(logMessage);
const devices = new DevicesDatabase();
const params = new URLSearchParams(window.location.search);

loader.addParser(["hex", "ihx"], IntelHexParser);
loader.addParser(["srec", "s19", "s28", "s37"], SRecordParser);
loader.addParser(["elf"], ElfRiscVParser);
loader.addEventListener("progress", updateUrlLoadProgress);

window.addEventListener("load", (event) => {
	try {
		const deviceList = document.getElementById("device_list");
		const deviceConnectUsb = document.getElementById("device_connect_usb");
		const deviceConnectUart = document.getElementById("device_connect_uart");
		const deviceDtrRtsReset = document.getElementById("device_dtr_rts_reset");
		const fwTabFile = document.getElementById("fw_tab_file");
		const fwTabUrl = document.getElementById("fw_tab_url");
		const fwUrl = document.getElementById("fw_url");
		const fwUrlLoad = document.getElementById("fw_url_load");
		const fwFile = document.getElementById("fw_file");
		const fwHex = document.getElementById("fw_hex");
		const configRead = document.getElementById("config_read");
		const configWrite = document.getElementById("config_write");
		const flashWrite = document.getElementById("flash_write");
		const flashVerify = document.getElementById("flash_verify");
		const flashErase = document.getElementById("flash_erase");
		const endReset = document.getElementById("end_reset");
		const logClear = document.getElementById("log_clear");
		
		let device, firmware;
		
		devices.populateDeviceList(deviceList);
		
		fwUrl.addEventListener("input", (event) => {
			fwUrlLoad.disabled = !event.target.validity.valid;
		});
		
		fwUrl.addEventListener("keydown", (event) => {
			if(event.key == "Enter" && event.target.validity.valid) {
				fwUrlLoad.dispatchEvent(new Event("click"));
			}
		});
		
		fwUrlLoad.addEventListener("click", (event) => {
			clearHexListing();
			
			loader.fromUrl(fwUrl.value)
				.then((fw) => {
					logger.info("Loaded " + fw.format + " firmware file from \"" + fwUrl.value + "\"");
					fw.fillToEndOfSegment(1024);
					createHexListing(fw.bytes, fw.fileName);
					checkFirmwareSize(fw.size, device["flash"]["size"]);
					firmware = fw;
				})
				.catch((err) => {
					logger.error("Failed to load firmware from URL \"" + fwUrl.value + "\"");
					logger.error(err.message);
					window.alert(
						"Failed to load firmware from URL \"" + fwUrl.value + "\".\n\n" +
						"See log for details."
					);
					firmware = undefined;
					setActionButtonsEnabled(false, ["flash_write", "flash_verify"]);
				});
		});
		
		fwFile.addEventListener("change", (event) => {
			if(fwFile.files.length > 0) {
				clearHexListing();
				
				loader.fromFile(fwFile.files[0])
					.then((fw) => {
						logger.info("Loaded " + fw.format + " firmware file from \"" + fwFile.files[0].name + "\"");
						fw.fillToEndOfSegment(1024);
						createHexListing(fw.bytes, fw.fileName);
						checkFirmwareSize(fw.size, device["flash"]["size"]);
						firmware = fw;
					})
					.catch((err) => {
						logger.error("Failed to load firmware from file \"" + fwFile.files[0].name + "\"");
						logger.error(err.message);
						window.alert(
							"Failed to load firmware from file \"" + fwFile.files[0].name + "\".\n\n" +
							"See log for details."
						);
						firmware = undefined;
						setActionButtonsEnabled(false, ["flash_write", "flash_verify"]);
					});
			}
		});
		
		fwHex.addEventListener("dragover", (event) => {
			event.dataTransfer.dropEffect = (event.dataTransfer.types.includes("Files") ? "copy" : "none");
			event.preventDefault();
		});
		
		fwHex.addEventListener("drop", (event) => {
			for(const item of event.dataTransfer.items) {
				if(item.kind === "string" && item.type === "text/uri-list") {
					// Set the dropped URI as URL input value and trigger its
					// input event.
					// Why can't getAsString() just return the damned string!?
					item.getAsString((uri) => {
						fwTabUrl.checked = true;
						fwUrl.value = uri;
						fwUrl.dispatchEvent(new Event("input"));
						fwUrlLoad.dispatchEvent(new Event("click"));
					});
					
					// Don't continue to look at any other items.
					break;
				} else if(item.kind === "file") {
					// Assign the dropped file(s) to file input and manually
					// trigger its change event.
					fwTabFile.checked = true;
					fwFile.files = event.dataTransfer.files;
					fwFile.dispatchEvent(new Event("change"));
					
					// Don't continue to look at any other items.
					break;
				}
			}
			
			event.preventDefault();
		});
		
		deviceList.addEventListener("change", (event) => {
			device = devices.findDeviceByIndex(deviceList.value);
			
			logger.info(
				"Selected device changed to: " +
				device["name"] + " (" + device["package"] + ", " + Formatter.byteSize(device["flash"]["size"]) + " flash)"
			);
			
			deviceConnectUsb.disabled = !device["connection"]["usb"];
			deviceConnectUart.disabled = !device["connection"]["uart"];
			deviceDtrRtsReset.disabled = !device["connection"]["uart"];
			
			// When only USB or only UART supported, auto-select that option.
			if(device["connection"]["usb"] && !device["connection"]["uart"]) {
				deviceConnectUsb.checked = true;
			} else if(device["connection"]["uart"] && !device["connection"]["usb"]) {
				deviceConnectUart.checked = true;
			}
			
			if(firmware !== undefined) {
				checkFirmwareSize(firmware.size, device["flash"]["size"]);
			}
		});
		
		deviceConnectUsb.addEventListener("change", (event) => {
			deviceDtrRtsReset.disabled = event.target.checked;
		});
		
		deviceConnectUart.addEventListener("change", (event) => {
			deviceDtrRtsReset.disabled = !event.target.checked;
		});
		
		[
			"cfg_rdpr", "cfg_user", "cfg_data0", "cfg_data1",
			"cfg_wrpr0", "cfg_wrpr1", "cfg_wrpr2", "cfg_wrpr3"
		].forEach((id) => {
			document.getElementById(id).addEventListener("input", (event) => {
				setActionButtonsEnabled(getConfigIsValid(), ["config_write"]);
			});
		});
	
		configRead.addEventListener("click", async (event) => {
			let success = false;
			const btnState = setActionButtonsEnabled(false);
			try {
				const sess = new Session(device, getConnectionParams());
				sess.setLogger(logger);
				sess.addEventListener("progress", updateOperationProgress);
				await sess.start()
					.then(() => sess.identify())
					.then(() => sess.configRead())
					.then((config) => (populateConfig(config), sess.reset(endReset.checked)))
					.then(() => success = true)
					.catch((err) => logger.error(err.message))
					.finally(() => sess.end());
			} catch(err) {
				logger.error(err.message);
			} finally {
				updateOperationResult(success);
				restoreActionButtonsEnabled(btnState);
				setActionButtonsEnabled(getConfigIsValid(), ["config_write"]);
			}
		});
		
		configWrite.addEventListener("click", async (event) => {
			let success = false;
			const btnState = setActionButtonsEnabled(false);
			try {
				const sess = new Session(device, getConnectionParams());
				sess.setLogger(logger);
				sess.addEventListener("progress", updateOperationProgress);
				await sess.start()
					.then(() => sess.identify())
					.then(() => sess.configRead())
					.then(() => sess.configWrite(getConfigBytes()))
					.then(() => sess.reset(endReset.checked))
					.then(() => success = true)
					.catch((err) => logger.error(err.message))
					.finally(() => sess.end());
			} catch(err) {
				logger.error(err.message);
			} finally {
				updateOperationResult(success);
				restoreActionButtonsEnabled(btnState);
			}
		});
		
		flashWrite.addEventListener("click", async (event) => {
			let success = false;
			const btnState = setActionButtonsEnabled(false);
			try {
				const sess = new Session(device, getConnectionParams());
				sess.setLogger(logger);
				sess.addEventListener("progress", updateOperationProgress);
				await sess.start()
					.then(() => sess.identify())
					.then(() => sess.configRead())
					.then(() => sess.keyGenerate())
					.then(() => sess.flashErase(firmware.getSectorCount(1024)))
					.then(() => sess.flashWrite(firmware.bytes))
					.then(() => sess.keyGenerate())
					.then(() => sess.flashVerify(firmware.bytes))
					.then(() => sess.reset(endReset.checked))
					.then(() => success = true)
					.catch((err) => logger.error(err.message))
					.finally(() => sess.end());
			} catch(err) {
				logger.error(err.message);
			} finally {
				updateOperationResult(success);
				restoreActionButtonsEnabled(btnState);
			}
		});
		
		flashVerify.addEventListener("click", async (event) => {
			let success = false;
			const btnState = setActionButtonsEnabled(false);
			try {
				const sess = new Session(device, getConnectionParams());
				sess.setLogger(logger);
				sess.addEventListener("progress", updateOperationProgress);
				await sess.start()
					.then(() => sess.identify())
					.then(() => sess.configRead())
					.then(() => sess.keyGenerate())
					.then(() => sess.flashVerify(firmware.bytes))
					.then(() => sess.reset(endReset.checked))
					.then(() => success = true)
					.catch((err) => logger.error(err.message))
					.finally(() => sess.end());
			} catch(err) {
				logger.error(err.message);
			} finally {
				updateOperationResult(success);
				restoreActionButtonsEnabled(btnState);
			}
		});
		
		flashErase.addEventListener("click", async (event) => {
			if(window.confirm(
				"Are you sure you want to ERASE the device?\n\n" +
				"This will destroy ALL data in the user application flash!"
			)) {
				let success = false;
				const btnState = setActionButtonsEnabled(false);
				try {
					const sess = new Session(device, getConnectionParams());
					sess.setLogger(logger);
					sess.addEventListener("progress", updateOperationProgress);
					await sess.start()
						.then(() => sess.identify())
						.then(() => sess.configRead())
						.then(() => sess.flashErase(Math.ceil(device["flash"]["size"] / 1024)))
						.then(() => sess.reset(endReset.checked))
						.then(() => success = true)
						.catch((err) => logger.error(err.message))
						.finally(() => sess.end());
				} catch(err) {
					logger.error(err.message);
				} finally {
					updateOperationResult(success);
					restoreActionButtonsEnabled(btnState);
				}
			}
		});
		
		logClear.addEventListener("click", (event) => {
			clearLog();
		});
		
		// Wait a moment after page has fully loaded to allow browser auto-fill
		// of form inputs to occur, then try and take actions where necessary
		// according to their values. This is a bit of a hack, because there's
		// no event for that.
		setTimeout(() => {
			if(params.has("dev")) {
				// When a device name was given in URL parameter, find it and
				// automatically select it in the list.
				const idx = devices.findDeviceIndexByName(params.get("dev"));
				if(idx) {
					deviceList.value = idx;
					deviceList.dispatchEvent(new Event("change"));
				} else {
					throw new Error("Couldn't find device with name \"" + params.get("dev") + "\"");
				}
			} else {
				// Otherwise, update with any auto-filled device selection.
				if(deviceList.selectedOptions.length > 0) {
					deviceList.dispatchEvent(new Event("change"));
				}
			}
			
			if(params.has("conn")) {
				// If connection method matches one of those available, then
				// automatically select it.
				const conn = [deviceConnectUsb, deviceConnectUart].find((opt) => {
					return (opt.value === params.get("conn").toLowerCase());
				});
				if(conn) {
					conn.checked = true;
					conn.dispatchEvent(new Event("change"));
				}
			} else {
				// Otherwise, handle any auto-filled selection.
				// TODO: is this actually necessary?
				[deviceConnectUsb, deviceConnectUart].forEach((opt) => {
					if(opt.checked) opt.dispatchEvent(new Event("change"));
				});
			}
			
			if(params.has("fw")) {
				// When a firmware file URL was given in URL parameter, select
				// the 'URL' tab and load that firmware.
				fwTabUrl.checked = true;
				fwUrl.value = params.get("fw");
				fwUrl.dispatchEvent(new Event("input"));
				fwUrlLoad.dispatchEvent(new Event("click"));
			} else {
				// Otherwise, if the Local File tab is currently selected,
				// update with any auto-filled firmware filename. Or, if the URL
				// tab is selected, process auto-filled firmware URL.
				if(fwTabFile.checked && fwFile.files.length > 0) {
					fwFile.dispatchEvent(new Event("change"));
				} else if(fwTabUrl.checked && fwUrl.validity.valid) {
					fwUrl.dispatchEvent(new Event("input"));
					fwUrlLoad.dispatchEvent(new Event("click"));
				}
			}
		}, 250);
	} catch(err) {
		console.error(err);
		logger.error(err.message);
		if(err.cause instanceof Error) {
			logger.error(err.cause.message);
		}
	}
});
