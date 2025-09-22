const channels = [];

exports.createChannel = (req, res) => {
  const { name } = req.body;
  if (channels.find(c => c.name === name)) {
    return res.status(400).json({ message: 'Channel already exists' });
  }
  const channel = { id: channels.length + 1, name };
  channels.push(channel);
  res.status(201).json(channel);
};

exports.getChannels = (req, res) => {
  res.json(channels);
};
