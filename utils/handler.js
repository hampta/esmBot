import { paths, commands, messageCommands, info, sounds, categories, aliases as _aliases } from "./collections.js";
import { log } from "./logger.js";

import { readFileSync } from "fs";

const { blacklist } = JSON.parse(readFileSync(new URL("../config/commands.json", import.meta.url)));

let queryValue = 0;

// load command into memory
export async function load(client, cluster, worker, ipc, command, soundStatus, slashReload = false) {
  const { default: props } = await import(`${command}?v=${queryValue}`);
  queryValue++;
  if (props.requires.includes("sound") && soundStatus) {
    log("warn", `Failed to connect to some Lavalink nodes, skipped loading command ${command}...`);
    return;
  }
  const commandArray = command.split("/");
  let commandName = commandArray[commandArray.length - 1].split(".")[0];
  const category = commandArray[commandArray.length - 2];

  if (blacklist.includes(commandName)) {
    log("warn", `Skipped loading blacklisted command ${command}...`);
    return;
  }

  if (category === "message") {
    const nameStringArray = commandName.split("-");
    for (const index of nameStringArray.keys()) {
      nameStringArray[index] = nameStringArray[index].charAt(0).toUpperCase() + nameStringArray[index].slice(1);
    }
    commandName = nameStringArray.join(" ");
  }

  props.init();
  paths.set(commandName, command);

  const commandInfo = {
    category: category,
    description: props.description,
    aliases: props.aliases,
    params: props.arguments,
    flags: props.flags,
    slashAllowed: props.slashAllowed,
    directAllowed: props.directAllowed,
    type: 1
  };

  if (category === "message") {
    messageCommands.set(commandName, props);
    commandInfo.type = 3;
  } else {
    commands.set(commandName, props);

    if (slashReload && props.slashAllowed) {
      const commandList = await client.getCommands();
      const oldCommand = commandList.filter((item) => {
        return item.name === commandName;
      })[0];
      await client.editCommand(oldCommand.id, {
        name: commandName,
        type: 1,
        description: props.description,
        options: props.flags
      });
    }
  }

  if (Object.getPrototypeOf(props).name === "SoundboardCommand") sounds.set(commandName, props.file);

  info.set(commandName, commandInfo);

  const categoryCommands = categories.get(category);
  categories.set(category, categoryCommands ? [...categoryCommands, commandName] : [commandName]);
  
  if (props.aliases) {
    for (const alias of props.aliases) {
      _aliases.set(alias, commandName);
      paths.set(alias, command);
    }
  }
  return commandName;
}

export async function update() {
  const commandArray = [];
  const merged = new Map([...commands, ...messageCommands]);
  for (const [name, command] of merged.entries()) {
    let cmdInfo = info.get(name);
    if (command.postInit) {
      const cmd = command.postInit();
      cmdInfo = {
        category: cmdInfo.category,
        description: cmd.description,
        aliases: cmd.aliases,
        params: cmd.arguments,
        flags: cmd.flags,
        slashAllowed: cmd.slashAllowed,
        directAllowed: cmd.directAllowed,
        type: cmdInfo.type
      };
      info.set(name, cmdInfo);
    }
    if (cmdInfo?.type === 3) {
      commandArray.push({
        name: name,
        type: cmdInfo.type,
        dm_permission: cmdInfo.directAllowed
      });
    } else if (cmdInfo?.slashAllowed) {
      commandArray.push({
        name,
        type: cmdInfo.type,
        description: cmdInfo.description,
        options: cmdInfo.flags,
        dm_permission: cmdInfo.directAllowed
      });
    }
  }
  return commandArray;
}