import { BABY_MESSAGES } from './src/constants/babyMessages';
import { BABY_MESSAGES_STARCH, BABY_MESSAGES_MOM_HARDWORK, BABY_MESSAGES_DAD_TASKS, BABY_MESSAGES_TAIWAN_FOOD, BABY_MESSAGES_FUTURE } from './src/constants/babyMessagesDynamic';
import { BABY_MESSAGES_NEW_PART_1, BABY_MESSAGES_NEW_PART_2 } from './src/constants/babyMessagesAdd1';
import { BABY_MESSAGES_NEW_PART_3 } from './src/constants/babyMessagesAdd3';
import { BABY_MESSAGES_NEW_PART_4 } from './src/constants/babyMessagesAdd4';
import { BABY_MESSAGES_NEW_PART_OPTIONS } from './src/constants/babyMessagesAddOptions';

const all = [
  ...BABY_MESSAGES,
  ...BABY_MESSAGES_STARCH,
  ...BABY_MESSAGES_MOM_HARDWORK, 
  ...BABY_MESSAGES_DAD_TASKS,
  ...BABY_MESSAGES_TAIWAN_FOOD,
  ...BABY_MESSAGES_FUTURE,
  ...BABY_MESSAGES_NEW_PART_1,
  ...BABY_MESSAGES_NEW_PART_2,
  ...BABY_MESSAGES_NEW_PART_3,
  ...BABY_MESSAGES_NEW_PART_4,
  ...BABY_MESSAGES_NEW_PART_OPTIONS.map(o => o.text)
];

const unique = new Set(all);
console.log(unique.size);
