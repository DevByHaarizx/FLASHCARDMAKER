/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI} from '@google/genai';

interface Flashcard {
  term: string;
  definition: string;
}

const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const generateButton = document.getElementById(
  'generateButton',
) as HTMLButtonElement;
const flashcardsContainer = document.getElementById(
  'flashcardsContainer',
) as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const searchBar = document.getElementById('searchBar') as HTMLInputElement;
const undoButton = document.getElementById('undoButton') as HTMLButtonElement;
const themeToggleButton = document.getElementById('themeToggle') as HTMLButtonElement;
const flashcardCounter = document.getElementById('flashcardCounter') as HTMLDivElement;
const selectButton = document.getElementById('selectButton') as HTMLButtonElement;
const deleteSelectedButton = document.getElementById('deleteSelectedButton') as HTMLButtonElement;


const FLASHCARDS_LOCAL_STORAGE_KEY = 'gemini-flashcards';
const THEME_LOCAL_STORAGE_KEY = 'gemini-flashcards-theme';
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

// Holds the current state of flashcards
let currentFlashcards: Flashcard[] = [];
// Holds the state before the last modification for the undo feature
let previousState: Flashcard[] | null = null;
// State for multi-selection
let isMultiSelectMode = false;
let selectedCards = new Set<number>();


/**
 * Updates the visibility and state of the undo button.
 */
function updateUndoButtonState() {
  if (previousState) {
    undoButton.style.display = 'inline-block';
    undoButton.disabled = false;
  } else {
    undoButton.style.display = 'none';
    undoButton.disabled = true;
  }
}

/**
 * Updates the text content of the flashcard counter element.
 */
function updateFlashcardCount() {
  const totalCards = currentFlashcards.length;
  
  if (totalCards === 0) {
    flashcardCounter.textContent = '';
    flashcardCounter.style.display = 'none';
    return;
  }
  
  const visibleCards = flashcardsContainer.querySelectorAll('.flashcard:not(.hidden)').length;
  flashcardCounter.textContent = `Showing ${visibleCards} of ${totalCards}`;
  flashcardCounter.style.display = 'block';
}


/**
 * Saves a deep copy of the current flashcards state to `previousState`.
 */
function savePreviousState() {
  previousState = currentFlashcards.map(card => ({...card}));
  updateUndoButtonState();
}

/**
 * Updates the visibility and text of the 'Delete Selected' button.
 */
function updateDeleteSelectedButtonState() {
  if (selectedCards.size > 0) {
    deleteSelectedButton.style.display = 'inline-block';
    deleteSelectedButton.textContent = `Delete Selected (${selectedCards.size})`;
    deleteSelectedButton.disabled = false;
  } else {
    deleteSelectedButton.style.display = 'none';
    deleteSelectedButton.disabled = true;
  }
}

/**
 * Toggles the selection state of a single flashcard.
 * @param index - The index of the card to toggle.
 */
function toggleCardSelection(index: number) {
  const cardElement = flashcardsContainer.querySelectorAll('.flashcard')[index] as HTMLElement;
  if (!cardElement) return;
  const checkbox = cardElement.querySelector('.flashcard-checkbox') as HTMLInputElement;

  if (selectedCards.has(index)) {
    selectedCards.delete(index);
    cardElement.classList.remove('is-selected');
    checkbox.checked = false;
  } else {
    selectedCards.add(index);
    cardElement.classList.add('is-selected');
    checkbox.checked = true;
  }
  updateDeleteSelectedButtonState();
}


/**
 * Renders the flashcards to the DOM.
 * @param flashcards An array of flashcard objects.
 */
function displayFlashcards(flashcards: Flashcard[]) {
  currentFlashcards = flashcards; // Keep track of the current state
  flashcardsContainer.textContent = ''; // Clear previous flashcards
  flashcardsContainer.classList.toggle('multi-select-mode', isMultiSelectMode);

  const controlsContainer = document.querySelector('.controls-container') as HTMLElement;
  if (flashcards.length > 0) {
    controlsContainer.style.display = 'flex';
    searchBar.style.display = 'block';
    selectButton.style.display = 'inline-block';
  } else {
    controlsContainer.style.display = 'none';
    searchBar.style.display = 'none';
    selectButton.style.display = 'none';
    searchBar.value = ''; // Clear search on generating new cards
  }


  flashcards.forEach((flashcard, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('flashcard');
    if (selectedCards.has(index)) {
      cardDiv.classList.add('is-selected');
    }
    cardDiv.dataset['index'] = index.toString();
    cardDiv.setAttribute('role', 'button');
    cardDiv.setAttribute(
      'aria-label',
      `Flashcard for ${flashcard.term}. Press Enter or Space to flip.`,
    );
    cardDiv.tabIndex = 0;
    cardDiv.title = 'Click or press Enter/Space to flip';

    cardDiv.draggable = !isMultiSelectMode;
    cardDiv.addEventListener('dragstart', () => {
      setTimeout(() => cardDiv.classList.add('dragging'), 0);
    });

    cardDiv.addEventListener('dragend', () => {
      cardDiv.classList.remove('dragging');
      updateOrderAndSave();
    });

    const cardInner = document.createElement('div');
    cardInner.classList.add('flashcard-inner');

    const cardFront = document.createElement('div');
    cardFront.classList.add('flashcard-front');

    const termDiv = document.createElement('div');
    termDiv.classList.add('term');
    termDiv.textContent = flashcard.term;

    const cardBack = document.createElement('div');
    cardBack.classList.add('flashcard-back');

    const definitionDiv = document.createElement('div');
    definitionDiv.classList.add('definition');
    definitionDiv.textContent = flashcard.definition;

    termDiv.contentEditable = 'false';
    definitionDiv.contentEditable = 'false';

    const editButton = document.createElement('button');
    editButton.classList.add('edit-button');
    editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit flashcard: ${flashcard.term}`);
    editButton.title = 'Edit flashcard';
    
    let originalCardState: Flashcard | null = null;

    const exitEditMode = (currentTerm: string) => {
      termDiv.contentEditable = 'false';
      definitionDiv.contentEditable = 'false';
      editButton.textContent = 'Edit';
      editButton.setAttribute('aria-label', `Edit flashcard: ${currentTerm}`);
      editButton.title = 'Edit flashcard';
      cardDiv.classList.remove('is-editing');
      originalCardState = null;
    };

    const saveAndEndEditing = () => {
      if (!cardDiv.classList.contains('is-editing')) return;

      const newTerm = termDiv.textContent?.trim() ?? '';
      const newDef = definitionDiv.textContent?.trim() ?? '';

      if (currentFlashcards[index].term !== newTerm || currentFlashcards[index].definition !== newDef) {
        savePreviousState();
        currentFlashcards[index] = { term: newTerm, definition: newDef };
        saveFlashcards(currentFlashcards);
        cardDiv.setAttribute('aria-label', `Flashcard for ${newTerm}. Press Enter or Space to flip.`);
        deleteButton.setAttribute('aria-label', `Delete flashcard: ${newTerm}`);
      }
      exitEditMode(newTerm);
    };
    
    const cancelEditing = () => {
        if (originalCardState) {
            termDiv.textContent = originalCardState.term;
            definitionDiv.textContent = originalCardState.definition;
            exitEditMode(originalCardState.term);
        }
    };

    editButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cardDiv.classList.contains('is-editing')) {
            saveAndEndEditing();
        } else {
            originalCardState = { term: flashcard.term, definition: flashcard.definition };
            cardDiv.classList.add('is-editing');
            termDiv.contentEditable = 'true';
            definitionDiv.contentEditable = 'true';
            editButton.textContent = 'Save';
            editButton.setAttribute('aria-label', `Save changes for flashcard: ${flashcard.term}`);
            editButton.title = 'Save changes';
            termDiv.focus();
        }
    });

    const handleBlur = () => {
        setTimeout(() => {
            if (!termDiv.contains(document.activeElement) && !definitionDiv.contains(document.activeElement)) {
                saveAndEndEditing();
            }
        }, 0);
    };
    termDiv.addEventListener('blur', handleBlur);
    definitionDiv.addEventListener('blur', handleBlur);

    const handleKeydown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          saveAndEndEditing();
          break;
        case 'Escape':
          e.preventDefault();
          cancelEditing();
          break;
      }
    };
    termDiv.addEventListener('keydown', handleKeydown);
    definitionDiv.addEventListener('keydown', handleKeydown);

    cardFront.appendChild(editButton);

    const deleteButton = document.createElement('button');
    deleteButton.classList.add('delete-button');
    deleteButton.textContent = '×';
    deleteButton.setAttribute('aria-label', `Delete flashcard: ${flashcard.term}`);
    deleteButton.title = 'Delete flashcard';

    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Are you sure you want to delete the flashcard "${flashcard.term}"?`)) {
        savePreviousState(); // Save state before deleting
        const updatedFlashcards = currentFlashcards.filter((_, i) => i !== index);
        saveFlashcards(updatedFlashcards);
        displayFlashcards(updatedFlashcards);
      }
    });

    // --- Multi-select Checkbox ---
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.classList.add('flashcard-checkbox');
    checkbox.checked = selectedCards.has(index);
    checkbox.setAttribute('aria-label', `Select flashcard: ${flashcard.term}`);
    cardFront.appendChild(checkbox);


    cardFront.appendChild(deleteButton);
    cardFront.appendChild(termDiv);
    cardBack.appendChild(definitionDiv);
    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardDiv.appendChild(cardInner);

    flashcardsContainer.appendChild(cardDiv);

    const flipCard = () => {
      // Don't flip if we are in edit mode
      if (cardDiv.classList.contains('is-editing')) return;
      cardDiv.classList.toggle('flipped');
    };

    cardDiv.addEventListener('click', (e) => {
      if (isMultiSelectMode) {
        e.preventDefault();
        toggleCardSelection(index);
      } else {
        flipCard();
      }
    });

    cardDiv.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !cardDiv.classList.contains('is-editing')) {
        event.preventDefault();
        if (isMultiSelectMode) {
          toggleCardSelection(index);
        } else {
          flipCard();
        }
      }
    });
  });
  updateFlashcardCount();
}

function saveFlashcards(flashcards: Flashcard[]) {
  try {
    localStorage.setItem(FLASHCARDS_LOCAL_STORAGE_KEY, JSON.stringify(flashcards));
  } catch (e) {
    console.error('Could not save flashcards to local storage:', e);
  }
}

function loadFlashcards(): Flashcard[] | null {
  try {
    const saved = localStorage.getItem(FLASHCARDS_LOCAL_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Could not load flashcards from local storage:', e);
    localStorage.removeItem(FLASHCARDS_LOCAL_STORAGE_KEY);
  }
  return null;
}

function getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
  const draggableElements = [...container.querySelectorAll('.flashcard:not(.dragging):not(.hidden)')] as HTMLElement[];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY, element: null as HTMLElement | null }
  ).element;
}

function updateOrderAndSave() {
  savePreviousState(); // Save state before reordering
  const orderedCards = [...flashcardsContainer.querySelectorAll('.flashcard')] as HTMLElement[];
  const newFlashcards: Flashcard[] = orderedCards.map(card => {
    const originalIndex = parseInt(card.dataset['index']!, 10);
    return currentFlashcards[originalIndex];
  });

  displayFlashcards(newFlashcards);
  applySearchFilter();
  saveFlashcards(newFlashcards);
}


flashcardsContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
  const afterElement = getDragAfterElement(flashcardsContainer, e.clientY);
  const dragging = document.querySelector('.dragging');
  if (dragging) {
    if (afterElement == null) {
      flashcardsContainer.appendChild(dragging);
    } else {
      flashcardsContainer.insertBefore(dragging, afterElement);
    }
  }
});

function applySearchFilter() {
  const searchTerm = searchBar.value.trim().toLowerCase();
  const searchWords = searchTerm.split(' ').filter(word => word.length > 0);
  const flashcardElements = flashcardsContainer.querySelectorAll('.flashcard');

  currentFlashcards.forEach((card, index) => {
    const cardElement = flashcardElements[index] as HTMLElement;
    if (!cardElement) return;

    let isVisible = true;
    if (searchWords.length > 0) {
      const cardText = `${card.term} ${card.definition}`.toLowerCase();
      // Check if all search words are present in the card's text
      isVisible = searchWords.every(word => cardText.includes(word));
    }

    cardElement.classList.toggle('hidden', !isVisible);
  });
  updateFlashcardCount();
}


searchBar.addEventListener('input', applySearchFilter);

undoButton.addEventListener('click', () => {
  if (previousState) {
    displayFlashcards(previousState);
    saveFlashcards(previousState);
    applySearchFilter();
    previousState = null; // Clear previous state after undoing
    updateUndoButtonState();
    
    // Announce the action to screen readers and show a temporary message.
    errorMessage.textContent = 'Last action undone.';
    setTimeout(() => {
      // Only clear the message if it's still the "undone" message
      if (errorMessage.textContent === 'Last action undone.') {
        errorMessage.textContent = '';
      }
    }, 3000);
  }
});

selectButton.addEventListener('click', () => {
    isMultiSelectMode = !isMultiSelectMode;
    if (isMultiSelectMode) {
        selectButton.textContent = 'Cancel';
    } else {
        selectButton.textContent = 'Select';
        selectedCards.clear();
        updateDeleteSelectedButtonState();
    }
    displayFlashcards(currentFlashcards); // Re-render to show/hide checkboxes
});

deleteSelectedButton.addEventListener('click', () => {
    if (selectedCards.size === 0) return;

    if (confirm(`Are you sure you want to delete ${selectedCards.size} flashcard(s)?`)) {
        savePreviousState();
        const updatedFlashcards = currentFlashcards.filter((_, i) => !selectedCards.has(i));

        // Exit select mode
        isMultiSelectMode = false;
        selectedCards.clear();
        selectButton.textContent = 'Select';
        updateDeleteSelectedButtonState();

        saveFlashcards(updatedFlashcards);
        displayFlashcards(updatedFlashcards);
    }
});


generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    errorMessage.textContent =
      'Please enter a topic or some terms and definitions.';
    flashcardsContainer.textContent = '';
    return;
  }

  errorMessage.textContent = 'Generating flashcards...';
  flashcardsContainer.textContent = '';
  generateButton.disabled = true;
  previousState = null; // Clear undo state on new generation
  updateUndoButtonState();

  try {
    const prompt = `Generate a list of flashcards for the topic of "${topic}". Each flashcard should have a term and a concise definition. Format the output as a list of "Term: Definition" pairs, with each pair on a new line. Ensure terms and definitions are distinct and clearly separated by a single colon. Here's an example output:
    Hello: Hola
    Goodbye: Adiós`;
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const responseText = result?.text ?? '';

    if (responseText) {
      const flashcards: Flashcard[] = responseText
        .split('\n')
        .map((line) => {
          const parts = line.split(':');
          if (parts.length >= 2 && parts[0].trim()) {
            const term = parts[0].trim();
            const definition = parts.slice(1).join(':').trim();
            if (definition) {
              return {term, definition};
            }
          }
          return null;
        })
        .filter((card): card is Flashcard => card !== null);

      if (flashcards.length > 0) {
        errorMessage.textContent = '';
        displayFlashcards(flashcards);
        saveFlashcards(flashcards);
      } else {
        errorMessage.textContent =
          'No valid flashcards could be generated from the response. Please check the format.';
      }
    } else {
      errorMessage.textContent =
        'Failed to generate flashcards or received an empty response. Please try again.';
    }
  } catch (error: unknown) {
    console.error('Error generating content:', error);
    const detailedError =
      (error as Error)?.message || 'An unknown error occurred';
    errorMessage.textContent = `An error occurred: ${detailedError}`;
    flashcardsContainer.textContent = '';
  } finally {
    generateButton.disabled = false;
  }
});


/**
 * Applies the selected theme and saves it to local storage.
 * @param theme - The theme to set ('light' or 'dark').
 */
function setTheme(theme: 'light' | 'dark') {
  document.body.classList.toggle('dark-mode', theme === 'dark');
  localStorage.setItem(THEME_LOCAL_STORAGE_KEY, theme);
  themeToggleButton.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggleButton.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

/**
 * Initializes the theme based on saved preference or system settings.
 */
function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_LOCAL_STORAGE_KEY) as 'light' | 'dark' | null;
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    setTheme(systemPrefersDark ? 'dark' : 'light');
  }

  themeToggleButton.addEventListener('click', () => {
    const isDarkMode = document.body.classList.contains('dark-mode');
    setTheme(isDarkMode ? 'light' : 'dark');
  });
}


// --- App Initialization ---
initializeTheme();
const initialFlashcards = loadFlashcards();
if (initialFlashcards && initialFlashcards.length > 0) {
  displayFlashcards(initialFlashcards);
}