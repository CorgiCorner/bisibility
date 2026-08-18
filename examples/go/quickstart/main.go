package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	bisibility "github.com/bisibility/bisibility-sdk-go"
)

const exampleID = "go-quickstart"
const maxHistoryAttempts = 5

// docs:start:method-contract
var docsMethodContract = map[string]any{
	"List projects":            (*bisibility.Client).ListProjects,
	"Create a project":         (*bisibility.Client).CreateProject,
	"Add keywords":             (*bisibility.Client).CreateKeywords,
	"Run a rank check":         (*bisibility.Client).RunRankCheck,
	"Read a rank-check result": (*bisibility.Client).GetRankCheckResult,
}
var _ = docsMethodContract

// docs:end:method-contract

func requiredEnv(name string) (string, error) {
	value := os.Getenv(name)
	if value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	return value, nil
}

func waitForRankHistory(
	ctx context.Context,
	client *bisibility.Client,
	keywordID string,
	expectedCheckID string,
) (*bisibility.RankCheck, error) {
	for attempt := 1; attempt <= maxHistoryAttempts; attempt++ {
		history, err := client.ListRankChecks(ctx, keywordID, &bisibility.ListRankChecksOptions{
			Limit:  10,
			Status: bisibility.RankCheckStatusCompleted,
		})
		if err != nil {
			return nil, err
		}
		for index := range history.Data {
			check := &history.Data[index]
			if check.ID == expectedCheckID {
				return check, nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}

	return nil, fmt.Errorf("rank history did not include check %s", expectedCheckID)
}

func positionLabel(position *int) string {
	if position == nil {
		return "none"
	}
	return fmt.Sprintf("%d", *position)
}

func run() (err error) {
	// docs:start:client-usage
	apiKey, err := requiredEnv("BISIBILITY_API_KEY")
	if err != nil {
		return err
	}
	baseURL, err := requiredEnv("BISIBILITY_BASE_URL")
	if err != nil {
		return err
	}

	client, err := bisibility.NewClient(
		bisibility.WithAPIKey(apiKey),
		bisibility.WithBaseURL(baseURL),
	)
	if err != nil {
		return err
	}

	ctx := context.Background()
	var keywordID string
	defer func() {
		if keywordID == "" {
			return
		}
		fmt.Printf("Deleting keyword %s\n", keywordID)
		if _, deleteErr := client.DeleteKeyword(ctx, keywordID); deleteErr != nil && err == nil {
			err = deleteErr
		}
	}()

	fmt.Println("Listing projects")
	projects, err := client.ListProjects(ctx)
	if err != nil {
		return err
	}
	// docs:end:client-usage
	if len(projects.Data) == 0 {
		return errors.New("no projects are available for this API key")
	}

	project := projects.Data[0]
	suffix := fmt.Sprintf("%d-%d", time.Now().UnixNano(), os.Getpid())
	keyword := fmt.Sprintf("sdk quickstart %s", suffix)
	targetURL := fmt.Sprintf("https://%s/quickstart", project.Domain)
	fmt.Printf("Using project %s\n", project.ID)
	fmt.Printf("Creating keyword %s\n", keyword)

	created, err := client.CreateKeywords(
		ctx,
		project.ID,
		bisibility.CreateKeywordsInput{
			Keywords: []bisibility.CreateKeywordInput{
				{
					Keyword:   keyword,
					Tags:      []string{"sdk-example"},
					TargetURL: &targetURL,
				},
			},
		},
		bisibility.WithIdempotencyKey(exampleID+"-"+suffix),
	)
	if err != nil {
		return err
	}
	if len(created.Results) == 0 || created.Results[0].Keyword.ID == "" {
		return errors.New("keyword creation did not return a keyword id")
	}
	keywordID = created.Results[0].Keyword.ID
	fmt.Printf("Created keyword %s\n", keywordID)

	fmt.Println("Running rank check")
	check, err := client.RunRankCheck(ctx, keywordID, nil)
	if err != nil {
		return err
	}
	fmt.Printf("Rank check %s completed with position %s\n", check.ID, positionLabel(check.Position))

	fmt.Println("Reading rank history")
	historyCheck, err := waitForRankHistory(ctx, client, keywordID, check.ID)
	if err != nil {
		return err
	}
	fmt.Printf("History includes %s from %s\n", historyCheck.ID, historyCheck.CheckedAt.Format(time.RFC3339))

	return nil
}

func main() {
	if err := run(); err != nil {
		var apiErr *bisibility.APIError
		if errors.As(err, &apiErr) {
			fmt.Fprintf(os.Stderr, "API error %d: %s\n", apiErr.StatusCode, apiErr.Error())
		} else {
			fmt.Fprintln(os.Stderr, err)
		}
		os.Exit(1)
	}
	fmt.Printf("OK %s\n", exampleID)
}
