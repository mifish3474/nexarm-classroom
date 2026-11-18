export {XYZ_REMOVED_MESSAGE,ProgramError,evaluateProgram,copyInstructions} from './ProgramLanguage';
export type {Instruction,PlannedStep,Numeric,Condition,PreparedProgram} from './ProgramLanguage';
import {evaluateProgram} from './ProgramLanguage';
import type {PlannedStep} from './ProgramLanguage';
export function interpret(input:unknown):PlannedStep[]{return evaluateProgram(input).steps;}
