#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  TyreBook - complete tyre inventory, GST billing, KhataBook, and business management app for
  tyre shops in India (Material Design 3, Firebase Auth+Firestore).
  Latest ask: add dedicated Old Tyres (Car/Truck) & Remould Tyres (Bike/Truck/Tractor) modules
  with Stock In / Stock Out / Current Stock / Purchase Price / Selling Price / Profit / Reports.
  Wire Dashboard KPIs to those modules and eliminate all runtime errors.

frontend:
  - task: "Dashboard runtime error (undefined oldStock / remouldStock)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/dashboard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "user"
        comment: "Dashboard threw ReferenceError because setStats used undeclared oldStock/remouldStock."
      - working: "NA"
        agent: "main"
        comment: "Computed oldStock/remouldStock from tyres filtered by tyreClass. Made Old/Remould KPI cards navigable to the new modules. Added Quick Actions rows for Old Tyres and Remould Tyres. Fixed missing 'tire-flat' MDI glyph app-wide."

  - task: "Old Tyres module (Car / Truck)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/old-tyres/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Uses shared TyreClassModule with categories=['car','truck']. Shows per-category Current Stock, Sales Value, Profit; supports inline Stock In / Stock Out via recordMovement()."

  - task: "Remould Tyres module (Bike / Truck / Tractor)"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/remould/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Uses shared TyreClassModule with categories=['bike','truck','tractor']."

  - task: "Reports segregation: Old & Remould breakdown"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(tabs)/reports.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added 'Old Tyres' and 'Remould Tyres' sections showing Sales Value, Tyres Sold, Current Stock and (owner-only) Profit under Today / Week / Month range."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: true

test_plan:
  current_focus:
    - "Dashboard runtime error (undefined oldStock / remouldStock)"
    - "Old Tyres module (Car / Truck)"
    - "Remould Tyres module (Bike / Truck / Tractor)"
    - "Reports segregation: Old & Remould breakdown"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Fixed the ReferenceError on Dashboard (oldStock/remouldStock now computed). Old/Remould
      KPI cards are clickable and navigate to /old-tyres and /remould. Added Quick Actions
      for both new modules. Added Old/Remould breakdown to Reports.
      Please validate:
        1. Owner login → Dashboard renders without crashes, all KPI cards visible.
        2. Tap "Old Tyres" KPI or quick action → routes to /old-tyres with Car/Truck chip row.
        3. Tap "Remould" KPI or quick action → routes to /remould with Bike/Truck/Tractor.
        4. Add a tyre from Old Tyres screen using + button; confirm tyreClass=old is preserved.
        5. Stock In / Stock Out inline buttons work and update Current Stock.
        6. Reports tab shows Old Tyres and Remould Tyres sections.
      Credentials: owner@test.com / password  (see /app/memory/test_credentials.md)
