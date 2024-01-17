import { log } from "../utils/logger.js";

export default async (client, user, guild) => {
    log(`[GUILD MEMBER REMOVE] ${user.username} (${user.id}) left.`);
    // add a role to the member when they join the server
    const _guild = await client.guilds.get(guild.id);
    // leave embed message
    const embed = {
        title: `Goodbye ${user.username}!`,
        description: `We hope you enjoyed your stay!`,
        color: 0xff0000,
        thumbnail: {
            url: user.avatarURL()
        },
        footer: {
            text: `User ID: ${user.id} | ${_guild.memberCount} members`
        },
        timestamp: new Date().toISOString()
    };
    await client.rest.channels.createMessage(process.env.WELCOME_CHANNEL_ID, { embeds: [embed] });
};