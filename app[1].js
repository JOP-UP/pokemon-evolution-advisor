"use strict";

const DATA_FILE = "pokemon.csv";
const SPRITE_BASE_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";

const STAT_FIELDS = [
  ["HP", "hp"],
  ["Attack", "attack"],
  ["Defense", "defense"],
  ["Special attack", "special_attack"],
  ["Special defense", "special_defense"],
  ["Speed", "speed"],
];

const pokemonSelect = document.querySelector("#pokemon-select");
const checkButton = document.querySelector("#check-button");
const statusMessage = document.querySelector("#status-message");
const resultSection = document.querySelector("#result-section");
const statTableBody = document.querySelector("#stat-table-body");
const recommendationBox = document.querySelector("#recommendation-box");

let pokemonData = [];

document.addEventListener("DOMContentLoaded", loadPokemonData);
checkButton.addEventListener("click", showEvolutionReport);
pokemonSelect.addEventListener("change", () => {
  if (pokemonSelect.value) {
    statusMessage.textContent = "Press CHECK! to view the evolution report.";
  }
});

async function loadPokemonData() {
  setControlsEnabled(false);

  try {
    const response = await fetch(DATA_FILE);

    if (!response.ok) {
      throw new Error(`Could not load ${DATA_FILE} (HTTP ${response.status}).`);
    }

    const csvText = await response.text();
    pokemonData = parsePokemonCsv(csvText);

    if (pokemonData.length === 0) {
      throw new Error("The CSV file contains no Pokemon records.");
    }

    populatePokemonSelect();
    statusMessage.textContent = `${pokemonData.length} Pokemon loaded. Choose one above!`;
    setControlsEnabled(true);
  } catch (error) {
    console.error(error);
    statusMessage.textContent =
      "ERROR: The Pokemon database could not be loaded. Check that pokemon.csv is in the same folder as index.html.";
  }
}

function parsePokemonCsv(csvText) {
  const cleanText = csvText.replace(/^\uFEFF/, "").trim();

  if (!cleanText) {
    return [];
  }

  const firstLine = cleanText.split(/\r?\n/, 1)[0];
  const delimiter = countCharacter(firstLine, ";") > countCharacter(firstLine, ",")
    ? ";"
    : ",";
  const rows = parseDelimitedText(cleanText, delimiter);
  const headers = rows.shift().map((header) => header.trim());

  return rows
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) => {
      const record = {};

      headers.forEach((header, index) => {
        record[header] = (row[index] ?? "").trim();
      });

      return record;
    })
    .filter((pokemon) => pokemon.pokemon && pokemon.species_id);
}

function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && insideQuotes && nextCharacter === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      insideQuotes = !insideQuotes;
    } else if (character === delimiter && !insideQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  rows.push(row);
  return rows;
}

function countCharacter(text, character) {
  return [...text].filter((item) => item === character).length;
}

function populatePokemonSelect() {
  const uniquePokemon = new Map();

  pokemonData.forEach((pokemon) => {
    const speciesId = normaliseId(pokemon.species_id);

    // Prefer the standard record with an available image over alternate forms.
    if (!uniquePokemon.has(speciesId) || hasImage(pokemon)) {
      uniquePokemon.set(speciesId, pokemon);
    }
  });

  const sortedPokemon = [...uniquePokemon.values()].sort((first, second) =>
    formatName(first.pokemon).localeCompare(formatName(second.pokemon))
  );

  const fragment = document.createDocumentFragment();

  sortedPokemon.forEach((pokemon) => {
    const option = document.createElement("option");
    option.value = String(pokemon.id);
    option.textContent = formatName(pokemon.pokemon);
    fragment.appendChild(option);
  });

  pokemonSelect.appendChild(fragment);
}

function showEvolutionReport() {
  const currentPokemon = pokemonData.find(
    (pokemon) => String(pokemon.id) === pokemonSelect.value
  );

  if (!currentPokemon) {
    resultSection.hidden = true;
    statusMessage.textContent = "Please select a Pokemon first.";
    pokemonSelect.focus();
    return;
  }

  const possibleEvolutions = findNextEvolutions(currentPokemon);

  if (possibleEvolutions.length === 0) {
    showFullyEvolvedResult(currentPokemon);
    return;
  }

  // Some Pokemon, such as Eevee, have several possible evolutions.
  // This simple advisor displays the option with the highest total stats.
  const nextEvolution = possibleEvolutions.sort(
    (first, second) => calculateStatTotal(second) - calculateStatTotal(first)
  )[0];

  updatePokemonCard("current", currentPokemon);
  updatePokemonCard("evolution", nextEvolution);
  updateStatTable(currentPokemon, nextEvolution);
  updateRecommendation(currentPokemon, nextEvolution, possibleEvolutions.length);

  statusMessage.textContent = "Evolution report complete!";
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function findNextEvolutions(currentPokemon) {
  const currentSpeciesId = normaliseId(currentPokemon.species_id);
  const uniqueEvolutions = new Map();

  pokemonData.forEach((pokemon) => {
    if (normaliseId(pokemon.evolves_from_species_id) === currentSpeciesId) {
      const speciesId = normaliseId(pokemon.species_id);

      if (!uniqueEvolutions.has(speciesId) || hasImage(pokemon)) {
        uniqueEvolutions.set(speciesId, pokemon);
      }
    }
  });

  return [...uniqueEvolutions.values()];
}

function showFullyEvolvedResult(pokemon) {
  updatePokemonCard("current", pokemon);

  setText("evolution-name", "No next evolution");
  setText("evolution-type", "---");
  setText("evolution-total", "---");
  hideImage(document.querySelector("#evolution-image"));

  statTableBody.replaceChildren();
  recommendationBox.classList.remove("recommend-yes");
  recommendationBox.classList.add("recommend-no");
  setText(
    "recommendation-text",
    `${formatName(pokemon.pokemon)} is already fully evolved according to the available data.`
  );

  statusMessage.textContent = "This Pokemon has no next evolution.";
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updatePokemonCard(prefix, pokemon) {
  setText(`${prefix}-name`, formatName(pokemon.pokemon));
  setText(`${prefix}-type`, formatTypes(pokemon));
  setText(`${prefix}-total`, calculateStatTotal(pokemon));
  updatePokemonImage(document.querySelector(`#${prefix}-image`), pokemon);
}

function updatePokemonImage(imageElement, pokemon) {
  if (!hasImage(pokemon)) {
    hideImage(imageElement);
    return;
  }

  imageElement.hidden = false;
  imageElement.alt = `${formatName(pokemon.pokemon)} sprite`;
  imageElement.onerror = () => hideImage(imageElement);
  imageElement.src = `${SPRITE_BASE_URL}${encodeURIComponent(pokemon.url_image)}`;
}

function hideImage(imageElement) {
  imageElement.hidden = true;
  imageElement.removeAttribute("src");
  imageElement.alt = "Image not available";
}

function updateStatTable(currentPokemon, nextEvolution) {
  const rows = STAT_FIELDS.map(([label, field]) => {
    const currentValue = toNumber(currentPokemon[field]);
    const evolutionValue = toNumber(nextEvolution[field]);
    const change = evolutionValue - currentValue;
    const tableRow = document.createElement("tr");

    [label, currentValue, evolutionValue, formatChange(change)].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      tableRow.appendChild(cell);
    });

    return tableRow;
  });

  statTableBody.replaceChildren(...rows);
}

function updateRecommendation(currentPokemon, nextEvolution, optionCount) {
  const currentTotal = calculateStatTotal(currentPokemon);
  const evolutionTotal = calculateStatTotal(nextEvolution);
  const improvement = evolutionTotal - currentTotal;
  const currentName = formatName(currentPokemon.pokemon);
  const evolutionName = formatName(nextEvolution.pokemon);
  const branchNote = optionCount > 1
    ? ` There are ${optionCount} possible evolutions; ${evolutionName} has the highest total stats in this dataset.`
    : "";

  recommendationBox.classList.remove("recommend-yes", "recommend-no");

  if (improvement > 0) {
    recommendationBox.classList.add("recommend-yes");
    setText(
      "recommendation-text",
      `YES! Evolving ${currentName} into ${evolutionName} increases its total stats by ${improvement}.${branchNote}`
    );
  } else {
    recommendationBox.classList.add("recommend-no");
    setText(
      "recommendation-text",
      `NOT NECESSARILY. ${evolutionName} does not have a higher total stat score than ${currentName} in this dataset.${branchNote}`
    );
  }
}

function calculateStatTotal(pokemon) {
  return STAT_FIELDS.reduce(
    (total, [, field]) => total + toNumber(pokemon[field]),
    0
  );
}

function formatTypes(pokemon) {
  const types = [pokemon.type_1, pokemon.type_2]
    .filter((type) => type && type.toUpperCase() !== "NA")
    .map(formatName);

  return types.join(" / ") || "Unknown";
}

function hasImage(pokemon) {
  return Boolean(
    pokemon.url_image && pokemon.url_image.toUpperCase() !== "NA"
  );
}

function normaliseId(value) {
  if (!value || String(value).toUpperCase() === "NA") {
    return "";
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? String(numericValue) : String(value).trim();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatChange(change) {
  if (change > 0) {
    return `+${change}`;
  }

  return String(change);
}

function formatName(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function setText(elementId, value) {
  document.querySelector(`#${elementId}`).textContent = value;
}

function setControlsEnabled(enabled) {
  pokemonSelect.disabled = !enabled;
  checkButton.disabled = !enabled;
}
