# Feature Plan V2: Paper Reader, Repo Reader & Navigator

This document outlines three major features planned for WhimCraft.

## Feature 1: Paper Reader

### Overview
A tool that accepts academic paper URLs (e.g., arXiv links), fetches paper metadata and PDF, analyzes the content, and outputs a structured analysis that can be saved as a Whim.

### User Flow
1. User pastes a paper URL (arXiv, ACL, etc.)
2. System extracts paper metadata (title, authors, abstract, date)
3. System locates and fetches the PDF
4. AI analyzes the paper content
5. Output structured analysis:
   - **Summary**: 2-3 sentence overview
   - **Problem Statement**: What problem does this solve?
   - **Key Contributions**: Bullet points
   - **Methodology**: Technical approach
   - **Results**: Key findings/metrics
   - **Limitations**: Acknowledged weaknesses
   - **Future Work**: Suggested directions
   - **Personal Notes**: Space for user annotations
6. User can save as Whim with one click

### Technical Considerations
- **URL Parsing**: Support arXiv, ACL Anthology, OpenReview, direct PDF links
- **PDF Extraction**: Use pdf-parse or similar library
- **Token Management**: Papers are long; need chunking strategy
- **Caching**: Cache fetched papers to avoid repeated downloads

### Open Questions
- [ ] Should this be a new page (`/paper`) or a modal in chat?
- [ ] Use existing Gemini models or a specialized one?
- [ ] How to handle papers with complex math/figures?
- [ ] Rate limiting for PDF fetching?

---

## Feature 2: Repo Reader

### Overview
Similar to Paper Reader, but analyzes GitHub repositories. Provides structural understanding of codebases.

### User Flow
1. User pastes a GitHub repo URL
2. System fetches repo metadata (name, description, stars, language)
3. System analyzes repo structure:
   - Directory tree
   - Key files (README, package.json, etc.)
   - Entry points
4. AI generates analysis:
   - **Overview**: What does this repo do?
   - **Tech Stack**: Languages, frameworks, dependencies
   - **Architecture**: High-level structure
   - **Key Components**: Important files/modules
   - **How to Use**: Setup/installation steps
   - **Code Quality**: Observations (tests, docs, patterns)
   - **Learning Points**: What can we learn from this codebase?
5. User can save as Whim

### Technical Considerations
- **GitHub API**: Use REST or GraphQL API for metadata
- **File Fetching**: Prioritize key files (README, config, entry points)
- **Token Limits**: Can't analyze entire large repos; need smart sampling
- **Rate Limits**: GitHub API has rate limits (60/hour unauthenticated, 5000/hour with token)

### Open Questions
- [ ] Should user provide GitHub token for higher rate limits?
- [ ] How deep to analyze? Just structure or actual code?
- [ ] Support private repos (requires auth)?
- [ ] How to handle monorepos?

---

## Feature 3: Navigator Welcome Page

### Overview
Refactor the chat page's default view (shown when no conversation is selected) from empty space to a useful navigator/dashboard.

### Current State
- Empty area with minimal content
- No actionable items
- Wasted screen real estate

### Proposed Design

```
+------------------------------------------+
|          Welcome, [User Name]            |
|                                          |
|  +----------------+  +----------------+  |
|  | Paper Reader   |  | Repo Reader    |  |
|  | Analyze papers |  | Analyze repos  |  |
|  +----------------+  +----------------+  |
|                                          |
|  --- Today's Tasks (from Goals & Plans) -|
|  [ ] Review paper on attention mechanisms|
|  [ ] Finish WhimCraft memory system      |
|  [ ] ...                                 |
|                                          |
|  --- Recent Conversations ---------------+
|  > Chat about React hooks (2h ago)       |
|  > Debug session (yesterday)             |
|                                          |
|  --- Quick Actions ----------------------|
|  [New Chat]  [New Whim]  [Profile]       |
+------------------------------------------+
```

### Components
1. **Greeting**: Personalized with user's name
2. **Feature Cards**: Entry points to Paper Reader & Repo Reader
3. **Today's Tasks**:
   - Pull from "Goals & Plans" folder (default folder)
   - Extract incomplete todo items from recent whims
   - Show top 3-5 tasks
4. **Recent Conversations**: Quick access to recent chats
5. **Quick Actions**: Common actions

### Technical Considerations
- **Goals & Plans Folder**: Create as default folder if not exists
- **Task Extraction**: Parse whim blocks for todo items
- **Clean Design**: Maintain WhimCraft's minimal aesthetic
- **Responsive**: Work on all screen sizes

### Task Generation Settings

Instead of hardcoding task logic, let users configure how their daily tasks are generated.

#### Settings UI (in Profile or dedicated Settings page)

```
+------------------------------------------+
|  Daily Task Generation Settings          |
+------------------------------------------+
|                                          |
|  Reference Whims:                        |
|  [x] Goals & Plans / Weekly Goals        |
|  [x] Goals & Plans / Project Roadmap     |
|  [ ] Work / Meeting Notes                |
|  [+ Add Whim Reference]                  |
|                                          |
|  Generation Prompt:                      |
|  +--------------------------------------+|
|  | Based on my goals and plans, suggest ||
|  | 3-5 actionable tasks I should focus  ||
|  | on today. Consider deadlines and     ||
|  | priorities.                          ||
|  +--------------------------------------+|
|                                          |
|  Display Format:                         |
|  (*) Todo List (checkboxes)              |
|  ( ) Bullet Points                       |
|  ( ) Numbered List                       |
|  ( ) Cards                               |
|                                          |
|  Auto-refresh: [ ] Daily at 6:00 AM      |
|                                          |
|  [Save Settings]  [Generate Now]         |
+------------------------------------------+
```

#### Data Model

```typescript
interface TaskGenerationSettings {
  userId: string;
  referenceWhimIds: string[];      // Whims to use as context
  generationPrompt: string;        // Custom prompt for AI
  displayFormat: 'todolist' | 'bullets' | 'numbered' | 'cards';
  autoRefresh: boolean;
  refreshTime?: string;            // e.g., "06:00"
  lastGenerated?: Date;
  generatedTasks?: GeneratedTask[];
}

interface GeneratedTask {
  id: string;
  content: string;
  completed: boolean;
  sourceWhimId?: string;           // Which whim this came from
  createdAt: Date;
}
```

#### How It Works

1. **User configures settings** once (or updates as needed)
2. **On Navigator load**:
   - Check if tasks need regeneration (new day or manual trigger)
   - Fetch content from reference whims
   - Send to AI with user's generation prompt
   - Parse and display tasks in chosen format
3. **User interacts**:
   - Check off completed tasks
   - Click task to see source whim
   - Manually regenerate anytime

#### Default Configuration (for new users)

```typescript
const defaultTaskSettings: TaskGenerationSettings = {
  referenceWhimIds: [],  // Empty until user adds
  generationPrompt: `Based on the reference documents, suggest 3-5
actionable tasks I should focus on today. Prioritize by urgency
and importance. Keep each task concise and specific.`,
  displayFormat: 'todolist',
  autoRefresh: false,
};
```

### Open Questions
- [ ] Store generated tasks in Firestore or regenerate each time?
- [ ] How many recent conversations to show?
- [ ] Should task completion sync back to source whims?

---

## Implementation Priority

| Feature | Complexity | Value | Suggested Order |
|---------|------------|-------|-----------------|
| Navigator Welcome | Medium | High | 1st |
| Paper Reader | High | High | 2nd |
| Repo Reader | High | Medium | 3rd |

**Rationale**:
- Navigator is foundational and improves UX immediately
- Paper Reader has clear use case (your research workflow)
- Repo Reader builds on Paper Reader patterns

---

## Decisions Made

1. **UI Location**: Dedicated pages
   - Paper Reader: `/paper`
   - Repo Reader: `/repo`

2. **Task Generation**: User-configurable settings
   - Users choose which whims to reference
   - Users write custom generation prompts
   - Display format options (todolist default)

---

## Discussion Points

1. **Shared Infrastructure**: Paper Reader and Repo Reader share patterns:
   - URL input → Fetch → Analyze → Display → Save as Whim
   - Consider building a generic "Content Analyzer" framework

2. **Whim Integration**: How tightly coupled with Whims?
   - Auto-create whim on analysis?
   - Or show analysis first, then "Save as Whim" button?

3. **Agentic Mode Integration**: Should these use the existing agent framework?
   - Could be agent tools: `paper_analyze`, `repo_analyze`
   - Or standalone features outside agent loop

---

## Next Steps

1. Start with Navigator Welcome Page
2. Build Task Generation Settings infrastructure
3. Implement Paper Reader (`/paper`)
4. Implement Repo Reader (`/repo`)

---

**Created**: December 1, 2025
**Status**: Planning
