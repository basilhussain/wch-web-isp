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

const ELF_MAGIC = 0x7F454C46; // 0x7F, 'E', 'L', 'F'
const ELF_CLASS_32BIT = 0x1;
const ELF_DATA_LITTLE_ENDIAN = 0x1;
const ELF_IDENT_VERSION_V1 = 0x1;
const ELF_TYPE_EXECUTABLE = 0x2;
const ELF_MACHINE_RISCV = 0xF3;
const ELF_VERSION_V1 = 0x1;
const ELF_SECTION_TYPE_LOADABLE = 0x1;
const ELF_HEADER_SIZE = 52;
const ELF_PROGRAM_HEADER_SIZE = 32;

export class ElfRiscVParser {
	static parse(buf, maxSize = 1048576, minSize = 64, fillVal = 0xFF) {
		const output = new ArrayBuffer(minSize, { maxByteLength: maxSize });
		
		// Because buffer is resizeable, this array view of it will always track
		// its length whenever the buffer is resized, so we can create one now
		// and use it later to fill resized areas.
		const filler = new Uint8Array(output);
		filler.fill(fillVal);
		
		const header = new DataView(buf, 0, ELF_HEADER_SIZE);
		
		// Check ELF header information to ensure we're dealing with a suitable
		// kind of ELF file.
		if(header.getUint32(0, false) !== ELF_MAGIC) throw new Error("Not an ELF file; non-matching magic bytes");
		if(header.getUint8(4) !== ELF_CLASS_32BIT) throw new Error("ELF must be 32-bit; 64-bit unsupported");
		if(header.getUint8(5) !== ELF_DATA_LITTLE_ENDIAN) throw new Error("ELF must be in little-endian format; big-endian unsupported");
		if(header.getUint8(6) !== ELF_IDENT_VERSION_V1) throw new Error("ELF ident version must be 1");
		if(header.getUint16(16, true) !== ELF_TYPE_EXECUTABLE) throw new Error("ELF object type is not executable");
		if(header.getUint16(18, true) !== ELF_MACHINE_RISCV) throw new Error("ELF machine ISA is not RISC-V");
		if(header.getUint32(20, true) !== ELF_VERSION_V1) throw new Error("ELF version must be 1");
		if(header.getUint16(40, true) !== ELF_HEADER_SIZE) throw new Error("ELF header size is unusual; not " + ELF_HEADER_SIZE + " bytes"); // Not sure if this worth validating?
		
		// const entryPoint = header.getUint32(24, true);
		const programHeaderOffset = header.getUint32(28, true);
		// const sectionHeaderOffset = header.getUint32(32, true);
		const programHeaderSize = header.getUint16(42, true);
		const programHeaderCount = header.getUint16(44, true);
		
		// console.debug(programHeaderOffset, programHeaderSize, programHeaderCount);
		
		// Sanity check the program header information.
		if(programHeaderSize !== ELF_PROGRAM_HEADER_SIZE) throw new Error("Unusual program header table entry size; not " + ELF_PROGRAM_HEADER_SIZE + " bytes");
		if(programHeaderCount === 0) throw new Error("Program header table entry count is zero");
		if((programHeaderOffset < ELF_HEADER_SIZE) || (programHeaderOffset >= buf.byteLength - (programHeaderSize * programHeaderCount))) {
			throw new Error("Invalid program header table offset");
		}
		
		for(let i = 0; i < programHeaderCount; i++) {
			const progHeader = new DataView(buf, programHeaderOffset + (i * programHeaderSize), programHeaderSize);
			
			const type = progHeader.getUint32(0, true);
			const offset = progHeader.getUint32(4, true);
			const virtualAddr = progHeader.getUint32(8, true);
			const physicalAddr = progHeader.getUint32(12, true);
			const fileSize = progHeader.getUint32(16, true);
			const memSize = progHeader.getUint32(20, true);
			const flags = progHeader.getUint32(24, true);

			// console.debug(type, offset, virtualAddr, physicalAddr, fileSize, memSize, flags);
			
			// Ensure it's a loadable segment comprised of some data in the ELF
			// file. Ignore other segments, as they are other stuff that doesn't
			// need to be loaded.
			if(type === ELF_SECTION_TYPE_LOADABLE && fileSize > 0) {
				if(offset >= buf.byteLength) throw new Error("Invalid segment offset; past end of file");
				
				// Resize the output buffer if necessary (will throw exception
				// if max size exceeded), then fill resized area, and finally
				// stuff the segment's data into it at the specified address.
				if(physicalAddr + fileSize > output.byteLength) {
					const fillFrom = output.byteLength;
					try {
						output.resize(physicalAddr + fileSize);
					} catch(err) {
						if(err instanceof RangeError) {
							err = new Error("Maximum size of " + output.maxByteLength.toLocaleString() + " bytes exceeded");
						}
						throw err;
					}
					filler.fill(fillVal, fillFrom);
				}
				const data = new Uint8Array(buf, offset, fileSize);
				new Uint8Array(output, physicalAddr, fileSize).set(data);
			}
		}
		
		return new Uint8Array(output);
	}
	
	static get forText() {
		return false;
	}
	
	static get formatName() {
		return "ELF";
	}
}
