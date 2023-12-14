import logger from "./logger.js";
import fs from "fs";
import format from "format-duration";
import { Shoukaku, Connectors } from "shoukaku";
import { setTimeout } from "timers/promises";

export const players = new Map();
export const queues = new Map();
export const skipVotes = new Map();

export let manager;
export let nodes = JSON.parse(fs.readFileSync(new URL("../config/servers.json", import.meta.url), { encoding: "utf8" })).lava;
export let connected = false;

export function connect(client) {
  manager = new Shoukaku(new Connectors.OceanicJS(client), nodes, { moveOnDisconnect: true, resume: true, reconnectInterval: 1500, reconnectTries: 6 });
  manager.on("error", (node, error) => {
    logger.error(`An error occurred on Lavalink node ${node}: ${error}`);
  });
  manager.on("debug", (node, info) => {
    logger.debug(`Debug event from Lavalink node ${node}: ${info}`);
  });
  manager.once("ready", () => {
    logger.log(`Successfully connected to ${manager.nodes.size} Lavalink node(s).`);
    connected = true;
  });
}

export async function reload(client) {
  if (!manager) connect(client);
  const activeNodes = manager.nodes;
  const json = await fs.promises.readFile(new URL("../config/servers.json", import.meta.url), { encoding: "utf8" });
  nodes = JSON.parse(json).lava;
  const names = nodes.map((a) => a.name);
  for (const name in activeNodes) {
    if (!names.includes(name)) {
      manager.removeNode(name);
    }
  }
  for (const node of nodes) {
    if (!activeNodes.has(node.name)) {
      manager.addNode(node);
    }
  }
  if (!manager.nodes.size) connected = false;
  return manager.nodes.size;
}

export async function play(client, soundUrl, options) {
  if (!connected) return { content: "I'm not connected to any audio servers!", flags: 64 };
  if (!manager) return { content: "The sound commands are still starting up!", flags: 64 };
  if (!options.guild) return { content: "This command only works in servers!", flags: 64 };
  if (!options.member.voiceState) return { content: "You need to be in a voice channel first!", flags: 64 };
  if (!options.guild.permissionsOf(client.user.id.toString()).has("CONNECT")) return { content: "I can't join this voice channel!", flags: 64 };
  const voiceChannel = options.guild.channels.get(options.member.voiceState.channelID) ?? await client.rest.channels.get(options.member.voiceState.channelID).catch(e => {
    logger.warn(`Failed to get a voice channel: ${e}`);
  });
  if (!voiceChannel) return { content: "I can't join this voice channel! Make sure I have the right permissions.", flags: 64 };
  if (!voiceChannel.permissionsOf(client.user.id.toString()).has("CONNECT")) return { content: "I don't have permission to join this voice channel!", flags: 64 };
  const node = manager.options.nodeResolver(manager.nodes);
  let response;
  try {
    response = await node.rest.resolve(soundUrl);
    if (!response) return { content: "🔊 I couldn't get a response from the audio server.", flags: 64 };
    if (response.loadType === "empty" || response.loadType === "error") return { content: "I couldn't find that song!", flags: 64 };
  } catch (e) {
    logger.error(e);
    return { content: "🔊 Hmmm, seems that all of the audio servers are down. Try again in a bit.", flags: 64 };
  }
  const oldQueue = queues.get(voiceChannel.guildID);
  if (!response?.data) return { content: "I couldn't find that song!", flags: 64 };
  let tracks = [];
  let info;
  let playlistInfo;
  switch (response.loadType) {
    case "track":
      info = response.data.info;
      tracks.push(response.data.encoded);
      break;
    case "search":
      info = response.data[0].info;
      tracks.push(response.data[0].encoded);
      break;
    case "playlist":
      info = response.data.tracks[0].info;
      playlistInfo = response.data.info;
      tracks = response.data.tracks.map((v) => v.encoded);
      break;
  }
  queues.set(voiceChannel.guildID, oldQueue ? [...oldQueue, ...tracks] : tracks);
  if (process.env.YT_DISABLED === "true" && info?.sourceName === "youtube") return { content: "YouTube playback is disabled on this instance.", flags: 64 };
  const playerMeta = players.get(options.guild.id);
  let player;
  if (manager.players.has(voiceChannel.guildID)) {
    player = manager.players.get(voiceChannel.guildID);
  } else if (playerMeta?.player) {
    const storedState = playerMeta?.player?.connection.state;
    if (storedState && storedState === 1) {
      player = playerMeta?.player;
    }
  }
  const connection = player ?? await manager.joinVoiceChannel({
    guildId: voiceChannel.guildID,
    channelId: voiceChannel.id,
    shardId: voiceChannel.guild.shard.id,
    deaf: true
  });

  if (oldQueue?.length) {
    return `Your ${response.loadType} \`${playlistInfo ? playlistInfo.name.trim() : (info?.title !== "" ? info?.title.trim() : "(blank)")}\` has been added to the queue!`;
  }

  nextSong(client, options, connection, tracks[0], info, voiceChannel, playerMeta?.host ?? options.member.id, playerMeta?.loop ?? false, playerMeta?.shuffle ?? false);
}

export async function nextSong(client, options, connection, track, info, voiceChannel, host, loop = false, shuffle = false, lastTrack = null) {
  skipVotes.delete(voiceChannel.guildID);
  let playingMessage;
  if (lastTrack === track && players.has(voiceChannel.guildID)) {
    playingMessage = players.get(voiceChannel.guildID).playMessage;
  } else {
    try {
      const content = {
        embeds: [{
          color: 16711680,
          author: {
            name: "Now Playing",
            iconURL: client.user.avatarURL()
          },
          fields: [{
            name: "ℹ️ Title",
            value: info.title?.trim() !== "" ? info.title : "(blank)"
          },
          {
            name: "🎤 Artist",
            value: info.author?.trim() !== "" ? info.author : "(blank)"
          },
          {
            name: "💬 Channel",
            value: voiceChannel.name
          },
          {
            name: "🌐 Node",
            value: connection.node?.name ?? "Unknown"
          },
          {
            name: `🔘${"▬".repeat(10)}`,
            value: `0:00/${info.isStream ? "∞" : format(info.length)}`
          }]
        }]
      };
      if (options.type === "classic") {
        playingMessage = await client.rest.channels.createMessage(options.channel.id, content);
      } else {
        if ((Date.now() - options.interaction.createdAt) >= 900000) { // discord interactions are only valid for 15 minutes
          playingMessage = await client.rest.channels.createMessage(options.channel.id, content);
        } else if (lastTrack && lastTrack !== track) {
          playingMessage = await options.interaction.createFollowup(content);
        } else {
          playingMessage = await options.interaction[options.interaction.acknowledged ? "editOriginal" : "createMessage"](content);
          if (!playingMessage) playingMessage = await options.interaction.getOriginal();
        }
      }
    } catch (e) {
      logger.error(e);
    }
  }
  connection.removeAllListeners("exception");
  connection.removeAllListeners("stuck");
  connection.removeAllListeners("end");
  await connection.setGlobalVolume(70);
  await connection.playTrack({ track });
  players.set(voiceChannel.guildID, { player: connection, type: "music", host, voiceChannel, originalChannel: options.channel, loop, shuffle, playMessage: playingMessage });
  connection.once("exception", (exception) => errHandle(exception, client, connection, playingMessage, voiceChannel, options));
  connection.on("stuck", async () => {
    await connection.movePlayer();
    await connection.resumePlayer();
  });
  connection.on("end", async (data) => {
    if (data.reason === "replaced") return;
    let queue = queues.get(voiceChannel.guildID);
    const player = players.get(voiceChannel.guildID);
    if (player && process.env.STAYVC === "true") {
      player.type = "idle";
      players.set(voiceChannel.guildID, player);
    }
    let newQueue;
    if (player?.shuffle) {
      if (player.loop) {
        queue.push(queue.shift());
      } else {
        queue = queue.slice(1);
      }
      queue.unshift(queue.splice(Math.floor(Math.random() * queue.length), 1)[0]);
      newQueue = queue;
    } else if (player?.loop) {
      queue.push(queue.shift());
      newQueue = queue;
    } else {
      newQueue = queue ? queue.slice(1) : [];
    }
    queues.set(voiceChannel.guildID, newQueue);
    if (newQueue.length !== 0) {
      const newTrack = await connection.node.rest.decode(newQueue[0]);
      nextSong(client, options, connection, newQueue[0], newTrack.info, voiceChannel, host, player.loop, player.shuffle, track);
      try {
        if (options.type === "classic") {
          if (newQueue[0] !== track && playingMessage.channel.messages.has(playingMessage.id)) await playingMessage.delete();
          if (newQueue[0] !== track && player.playMessage.channel.messages.has(player.playMessage.id)) await player.playMessage.delete();
        }
      } catch {
        // no-op
      }
    } else if (process.env.STAYVC !== "true") {
      await setTimeout(400);
      await manager.leaveVoiceChannel(voiceChannel.guildID);
      players.delete(voiceChannel.guildID);
      queues.delete(voiceChannel.guildID);
      skipVotes.delete(voiceChannel.guildID);
      try {
        const content = `🔊 The voice channel session in \`${voiceChannel.name}\` has ended.`;
        if (options.type === "classic") {
          await client.rest.channels.createMessage(options.channel.id, { content });
        } else {
          if ((Date.now() - options.interaction.createdAt) >= 900000) {
            await client.rest.channels.createMessage(options.channel.id, { content });
          } else {
            await options.interaction.createFollowup({ content });
          }
        }
      } catch {
        // no-op
      }
    }
    if (options.type === "classic") {
      try {
        if (playingMessage.channel.messages.has(playingMessage.id)) await playingMessage.delete();
        if (player?.playMessage.channel.messages.has(player.playMessage.id)) await player.playMessage.delete();
      } catch {
        // no-op
      }
    }
  });
}

export async function errHandle(exception, client, connection, playingMessage, voiceChannel, options, closed) {
  try {
    if (playingMessage?.channel.messages.has(playingMessage.id)) await playingMessage.delete();
    const playMessage = players.get(voiceChannel.guildID).playMessage;
    if (playMessage.channel.messages.has(playMessage.id)) await playMessage.delete();
  } catch {
    // no-op
  }
  players.delete(voiceChannel.guildID);
  queues.delete(voiceChannel.guildID);
  skipVotes.delete(voiceChannel.guildID);
  logger.error(exception);
  try {
    connection.node.leaveChannel(voiceChannel.guildID);
  } catch {
    // no-op
  }
  connection.removeAllListeners("exception");
  connection.removeAllListeners("stuck");
  connection.removeAllListeners("end");
  try {
    const content = closed ? `🔊 I got disconnected by Discord and tried to reconnect; however, I got this error instead:\n\`\`\`${exception}\`\`\`` : `🔊 Looks like there was an error regarding sound playback:\n\`\`\`${exception.type}: ${exception.error}\`\`\``;
    if (options.type === "classic") {
      await client.rest.channels.createMessage(playingMessage.channel.id, { content });
    } else {
      if ((Date.now() - options.interaction.createdAt) >= 900000) {
        await client.rest.channels.createMessage(options.channel.id, { content });
      } else {
        await options.interaction.createFollowup({ content });
      }
    }
  } catch {
    // no-op
  }
}