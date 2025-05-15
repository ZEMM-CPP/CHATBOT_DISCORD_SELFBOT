const fs = require('fs');
const path = require('path');

// Chemin vers le fichier problématique
const filePath = path.join(
  __dirname,
  'node_modules',
  'discord.js-selfbot-v13',
  'src',
  'managers',
  'ClientUserSettingManager.js'
);

// Vérifier si le fichier existe
if (!fs.existsSync(filePath)) {
  console.error('Fichier ClientUserSettingManager.js non trouvé!');
  process.exit(1);
}

// Lire le contenu du fichier
let content = fs.readFileSync(filePath, 'utf8');

// Trouver et remplacer la ligne problématique
const problemLine = 'all: data.friend_source_flags.all || false,';
const fixedLine = 'all: data.friend_source_flags?.all || false,';

if (content.includes(problemLine)) {
  // Patching du fichier
  content = content.replace(problemLine, fixedLine);
  
  // Sauvegarder le fichier modifié
  fs.writeFileSync(filePath, content, 'utf8');
  
  console.log('Patch appliqué avec succès!');
  console.log(`La ligne "${problemLine}" a été remplacée par "${fixedLine}"`);
} else {
  console.log('La ligne problématique n\'a pas été trouvée ou a déjà été modifiée.');
}

// Chercher et patcher d'autres occurrences similaires
const regex = /data\.friend_source_flags\.(.*?)(\s|\|\|)/g;
let match;
let patched = false;

while ((match = regex.exec(content)) !== null) {
  const originalLine = match[0];
  const optionalLine = originalLine.replace('friend_source_flags.', 'friend_source_flags?.');
  
  if (originalLine !== optionalLine && !originalLine.includes('?.')) {
    content = content.replace(originalLine, optionalLine);
    patched = true;
    console.log(`Patched: ${originalLine} -> ${optionalLine}`);
  }
}

if (patched) {
  // Sauvegarder le fichier avec toutes les modifications
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Patch complet appliqué!');
} 