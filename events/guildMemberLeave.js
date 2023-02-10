import { log } from "../utils/logger.js";

export default async (client, member) => {
    log(`[GUILD MEMBER ADD] ${member.user.username} (${member.user.id}) joined ${member.guild.name} (${member.guild.id}).`);
    // add a role to the member when they join the server

    // leave embed message
    const embed = {
        title: `Goodbye ${member.user.username}!`,
        description: `We hope you enjoyed your stay!`,
        color: 0xff0000,
        thumbnail: {
            url: member.user.avatarURL()
        },
        footer: {
            text: `User ID: ${member.user.id} | ${member.guild.memberCount} members`
        },
        timestamp: new Date().toISOString()
    };
    await client.rest.channels.createMessage(process.env.WELCOME_CHANNEL_ID, { embeds: [embed] });
};