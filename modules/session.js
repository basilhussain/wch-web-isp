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
 ******************************************************************************/

import { PacketType, Packet, InvalidPacketError } from "./packet.js";
import {
	CommandType, Command, IdentifyCommand, EndCommand, KeyCommand,
	FlashEraseCommand, FlashWriteCommand, FlashVerifyCommand, ConfigReadCommand,
	ConfigWriteCommand
} from "./command.js";
import {
	ResponseType, Response, IdentifyResponse, EndResponse, KeyResponse,
	FlashEraseResponse, FlashWriteResponse, FlashVerifyResponse,
	ConfigReadResponse, ConfigWriteResponse, InvalidResponseError,
	UnsuccessfulResponseError
} from "./response.js";
import { Transceiver } from "./transceiver.js";
import { Logger } from "./logger.js";
import { Formatter } from "./util.js";

const CHUNK_SIZE = 56;

export class Session extends EventTarget {
	#trx;
	#device;
	#logger = console;
	#optBytes;
	#bootVer;
	#chipUID;
	#key;
	#sequence = 0;
	
	constructor(deviceVariant, deviceType, deviceDtrRtsReset) {
		super();
		
		this.#trx = new Transceiver(deviceDtrRtsReset);
		this.#device = { variant: deviceVariant, type: deviceType };
	}
	
	#logPacket(prefix, packet) {
		this.#logger.debug(prefix + " (" + packet.length + " bytes): " + packet.toString());
	}
	
	#progressEvent(incr, total) {
		this.dispatchEvent(new CustomEvent("progress", {
			detail: {
				increment: incr,
				total: total
			}
		}));
	}
	
	setLogger(logger) {
		if(!(logger instanceof Logger)) throw new Error("Logger argument must be a Logger object");
		this.#logger = logger;
	}
	
	async start() {
		this.#logger.info("Starting new session");
		await this.#trx.open();
		this.#sequence = 0;
	}
	
	async end() {
		await this.#trx.close();
		this.#logger.info("Ended session");
	}
	
	async identify() {
		this.#logger.debug(++this.#sequence + ": Identify");
		
		let packet, cmd, resp;

		this.#progressEvent(null, null);
		
		// Send the command with expected device variant and type.
		cmd = new IdentifyCommand(this.#device.variant, this.#device.type);
		packet = Packet.fromCommand(cmd);
		this.#logPacket("TX", packet);
		await this.#trx.transmitPacket(packet);
		
		// Get response to the command.
		packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.Identify));
		this.#logPacket("RX", packet);
		if(!packet.isValid()) throw new InvalidPacketError();
		resp = IdentifyResponse.fromPacket(packet);
		if(!resp.isValid()) throw new InvalidResponseError();
		if(!resp.success) throw new UnsuccessfulResponseError();
		
		this.#logger.info(
			"Device variant: 0x" + Formatter.hex(resp.deviceVariant, 2) +
			", type: 0x" + Formatter.hex(resp.deviceType, 2)
		);
		
		// Error if type mismatch, warn if only variant mismatch.
		if(resp.deviceType != this.#device.type) {
			throw new Error("Reported device type does not match selected device");
		} else if(resp.deviceVariant != this.#device.variant) {
			this.#logger.warn("Reported device variant does not match selected device");
		}
		
		// Save what device variant and type the bootloader identified as.
		this.#device = {
			variant: resp.deviceVariant,
			type: resp.deviceType
		};
		
		this.#progressEvent(100, 100);
		
		return this.#device;
	}
	
	async reset(doReset) {
		this.#logger.debug(++this.#sequence + ": Reset");
		
		let packet, cmd, resp;

		this.#progressEvent(null, null);
		
		// Send the command with parameter indicating whether reset wanted.
		cmd = new EndCommand(doReset);
		packet = Packet.fromCommand(cmd);
		this.#logPacket("TX", packet);
		await this.#trx.transmitPacket(packet);
		
		// Get response to the command.
		packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.End));
		this.#logPacket("RX", packet);
		if(!packet.isValid()) throw new InvalidPacketError();
		resp = EndResponse.fromPacket(packet);
		if(!resp.isValid()) throw new InvalidResponseError();
		if(!resp.success) throw new UnsuccessfulResponseError();
		
		this.#progressEvent(100, 100);
	}
	
	async keyGenerate() {
		this.#logger.debug(++this.#sequence + ": Key Generate");
		
		let packet, cmd, resp;

		this.#progressEvent(null, null);
		
		// Send the command. Provide chip unique ID and device variant to key
		// calculation routine.
		cmd = new KeyCommand(this.#chipUID, this.#device.variant);
		packet = Packet.fromCommand(cmd);
		this.#logPacket("TX", packet);
		await this.#trx.transmitPacket(packet);
		
		// Save the generated key for later use by flash write/verify.
		this.#key = cmd.key;
		
		// Get response to the command.
		packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.Key));
		this.#logPacket("RX", packet);
		if(!packet.isValid()) throw new InvalidPacketError();
		resp = KeyResponse.fromPacket(packet);
		if(!resp.isValid()) throw new InvalidResponseError();
		if(!resp.success) throw new UnsuccessfulResponseError();
		
		// As a sanity check, verify that the received checksum of the key
		// calculated by the bootloader matches our own.
		if(cmd.keyChecksum != resp.keyChecksum) throw new Error("Key checksum mismatch");
		
		this.#progressEvent(100, 100);
		
		return this.#key;
	}
	
	async flashErase(sectorCount) {
		this.#logger.debug(++this.#sequence + ": Flash Erase");
		
		let packet, cmd, resp;

		this.#progressEvent(null, null);
		
		// Send the command with given number of 1K sectors to be erased.
		cmd = new FlashEraseCommand(sectorCount);
		packet = Packet.fromCommand(cmd);
		this.#logPacket("TX", packet);
		await this.#trx.transmitPacket(packet);
		
		// Get response to the command.
		packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.FlashErase));
		this.#logPacket("RX", packet);
		if(!packet.isValid()) throw new InvalidPacketError();
		resp = FlashEraseResponse.fromPacket(packet);
		if(!resp.isValid()) throw new InvalidResponseError();
		if(!resp.success) throw new UnsuccessfulResponseError();
		
		this.#progressEvent(100, 100);
	}
	
	async flashWrite(bytes) {
		this.#logger.debug(++this.#sequence + ": Flash Write");
		
		let packet, cmd, resp;
		
		for(let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
			// Call the progress callback with two arguments: the current number
			// of bytes so far, and the total number.
			this.#progressEvent(offset, bytes.length);
			
			// Send the command using current chunk's offset, chunk data, and
			// the key to encrypt it with.
			cmd = new FlashWriteCommand(offset, bytes.subarray(offset, offset + CHUNK_SIZE), this.#key);
			packet = Packet.fromCommand(cmd);
			this.#logPacket("TX", packet);
			await this.#trx.transmitPacket(packet);
			
			// Get response to the command.
			packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.FlashWrite));
			this.#logPacket("RX", packet);
			if(!packet.isValid()) throw new InvalidPacketError();
			resp = FlashWriteResponse.fromPacket(packet);
			if(!resp.isValid()) throw new InvalidResponseError();
			if(!resp.success) throw new UnsuccessfulResponseError();
		}
		
		// Send one final write command with zero-length data and offset at the
		// end of the data, in order to get bootloader to write any still
		// buffered data to flash.
		cmd = new FlashWriteCommand(bytes.length, new Uint8Array(0), this.#key);
		packet = Packet.fromCommand(cmd);
		this.#logPacket("TX", packet);
		await this.#trx.transmitPacket(packet);
		
		// Get response to the finalisation command.
		packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.FlashWrite));
		this.#logPacket("RX", packet);
		if(!packet.isValid()) throw new InvalidPacketError();
		resp = FlashWriteResponse.fromPacket(packet);
		if(!resp.isValid()) throw new InvalidResponseError();
		if(!resp.success) throw new UnsuccessfulResponseError();
		
		// One last progress call to finish off to 100%.
		this.#progressEvent(bytes.length, bytes.length);
	}
	
	async flashVerify(bytes) {
		this.#logger.debug(++this.#sequence + ": Flash Verify");
		
		let packet, cmd, resp;
		
		for(let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
			// Call the progress callback with two arguments: the current number
			// of bytes so far, and the total number.
			this.#progressEvent(offset, bytes.length);
			
			// Send the command using current chunk's offset, chunk data, and
			// the key to encrypt it with.
			cmd = new FlashVerifyCommand(offset, bytes.subarray(offset, offset + CHUNK_SIZE), this.#key);
			packet = Packet.fromCommand(cmd);
			this.#logPacket("TX", packet);
			await this.#trx.transmitPacket(packet);
			
			// Get response to the command.
			packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.FlashVerify));
			this.#logPacket("RX", packet);
			if(!packet.isValid()) throw new InvalidPacketError();
			resp = FlashVerifyResponse.fromPacket(packet);
			if(!resp.isValid()) throw new InvalidResponseError();
			if(!resp.success) throw new UnsuccessfulResponseError();
		}
		
		// One last progress call to finish off to 100%.
		this.#progressEvent(bytes.length, bytes.length);
	}
	
	async configRead() {
		this.#logger.debug(++this.#sequence + ": Config Read");
		
		let packet, cmd, resp;

		this.#progressEvent(null, null);
		
		// Send the command.
		cmd = new ConfigReadCommand();
		packet = Packet.fromCommand(cmd);
		this.#logPacket("TX", packet);
		await this.#trx.transmitPacket(packet);
		
		// Get response to the command.
		packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.ConfigRead));
		this.#logPacket("RX", packet);
		if(!packet.isValid()) throw new InvalidPacketError();
		resp = ConfigReadResponse.fromPacket(packet);
		if(!resp.isValid()) throw new InvalidResponseError();
		if(!resp.success) throw new UnsuccessfulResponseError();
		
		// Verify the chip unique ID checksum and warn if mismatch.
		if(resp.chipUniqueID.length == 8) {
			const uidWords = new Uint16Array(resp.chipUniqueID.buffer, 0, 4);
			if((uidWords[0] + uidWords[1] + uidWords[2]) % 65536 != uidWords[3]) {
				this.#logger.warn("Possibly invalid chip unique ID; checksum mismatch");
			}
		}
		
		// Save the option bytes, bootloader version, and chip unique ID data.
		this.#optBytes = resp.optionBytesRaw;
		this.#bootVer = resp.bootloaderVersion;
		this.#chipUID = resp.chipUniqueID;
		
		this.#logger.info("Device configuration:");
		this.#logger.info("   RDPR: 0x" + Formatter.hex(this.#optBytes[0], 2));
		this.#logger.info("   USER: 0x" + Formatter.hex(this.#optBytes[1], 2));
		this.#logger.info("  DATA0: 0x" + Formatter.hex(this.#optBytes[2], 2));
		this.#logger.info("  DATA1: 0x" + Formatter.hex(this.#optBytes[3], 2));
		this.#logger.info("  WRPR0: 0x" + Formatter.hex(this.#optBytes[4], 2));
		this.#logger.info("  WRPR1: 0x" + Formatter.hex(this.#optBytes[5], 2));
		this.#logger.info("  WRPR2: 0x" + Formatter.hex(this.#optBytes[6], 2));
		this.#logger.info("  WRPR3: 0x" + Formatter.hex(this.#optBytes[7], 2));
		this.#logger.info("  BTVER: " + this.#bootVer["major"] + "." + this.#bootVer["minor"]);
		this.#logger.info("  UNIID: " + Formatter.hex(this.#chipUID, 2));
		
		this.#progressEvent(100, 100);
		
		return {
			optionBytes: this.#optBytes,
			bootloaderVersion: this.#bootVer,
			chipUniqueID: this.#chipUID
		};
	}
	
	async configWrite(config) {
		this.#logger.debug(++this.#sequence + ": Config Write");
		
		let packet, cmd, resp;

		this.#progressEvent(null, null);
		
		// Send the command with given config data.
		cmd = new ConfigWriteCommand(config);
		packet = Packet.fromCommand(cmd);
		this.#logPacket("TX", packet);
		await this.#trx.transmitPacket(packet);
		
		// Get response to the command.
		packet = await this.#trx.receivePacket(Packet.sizeForResponseType(ResponseType.ConfigWrite));
		this.#logPacket("RX", packet);
		if(!packet.isValid()) throw new InvalidPacketError();
		resp = ConfigWriteResponse.fromPacket(packet);
		if(!resp.isValid()) throw new InvalidResponseError();
		if(!resp.success) throw new UnsuccessfulResponseError();
		
		this.#progressEvent(100, 100);
	}
}
