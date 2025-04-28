# Agentkit Development Roadmap (Phased Approach - 3 Months)

This roadmap outlines a phased development plan for Agentkit over the next three months, focusing on specific feature areas within defined timeframes.

## Month 1: Tooling Expansion

*   **Focus:** Building diverse tools for external API interactions.
*   **Goal:** Significantly expand the library of available tools beyond the core `@BaseActions` to interact with key external services and protocols.
*   **Tasks:**
    *   Identify and prioritize a list of target external APIs (e.g., DeFi protocols, data oracles, communication platforms, social media).
    *   Design and solidify a robust and extensible framework for adding, configuring, and managing these external tools within Agentkit.
    *   Implement a significant number of high-priority external API tools. Focus on breadth and covering common use cases.
    *   Develop clear documentation and usage examples for each new tool.
    *   Establish testing procedures to ensure tool reliability and correctness.
*   **Target Outcome:** A rich library of documented and tested external API tools available for agent development.

## Month 1 - Mid Month 2 (Weeks 2-6): Visual Programming Dashboard

*   **Focus:** Developing the visual programming / no-code interface.
*   **Goal:** Create a user-friendly visual editor that allows users to build and configure agents by connecting nodes representing triggers, actions (including the newly built tools), and basic logic.
*   **Tasks:**
    *   Select and integrate a suitable frontend library/framework for the visual editor (e.g., React Flow).
    *   Design the core user experience: nodes, connections, configuration panels, workflow validation.
    *   Implement drag-and-drop functionality for all available actions/tools (both `@BaseActions` and the newly added external tools).
    *   Develop the logic to translate the visual representation into the underlying Agentkit configuration format (e.g., JSON).
    *   Implement basic control flow nodes (e.g., conditional logic).
    *   Refine the UI/UX based on initial development and testing.
    *   Implement validation and error handling within the editor interface.
*   **Target Outcome:** A functional visual programming dashboard where users can create and configure agents using the available tools and basic logic constructs.

## Mid Month 2 - Month 3 (Weeks 7-8): Deployment API Frontend Integration

*   **Focus:** Integrating the frontend (likely the visual programming dashboard) with an existing deployment API.
*   **Goal:** Allow users to trigger the deployment of agents configured via the visual editor using a pre-existing backend deployment service.
*   **Tasks:**
    *   Understand the specifications and endpoints of the existing deployment API.
    *   Integrate API calls within the frontend/dashboard to:
        *   Send the generated agent configuration to the deployment API.
        *   Initiate the deployment process via the API.
        *   Fetch and display deployment status from the API.
        *   Potentially manage existing deployments (list, view status, undeploy) via the API.
    *   Implement necessary authentication/authorization handling for the API calls from the frontend.
    *   Refine the UI elements related to deployment management within the dashboard.
*   **Target Outcome:** Users can seamlessly deploy and monitor agents directly from the visual programming interface by interacting with the backend deployment API.

---

*Disclaimer: Timelines are estimates and may need adjustment based on complexity encountered during development.*
