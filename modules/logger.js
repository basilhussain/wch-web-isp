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
