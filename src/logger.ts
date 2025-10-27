import Logger, { TargetType, LogLevel } from '@joplin/utils/Logger';

const globalLogger = new Logger();
globalLogger.addTarget(TargetType.Console);
globalLogger.setLevel(LogLevel.Debug);
Logger.initializeGlobalLogger(globalLogger);

export const logger = Logger.create('heading-navigator');

export default logger;
